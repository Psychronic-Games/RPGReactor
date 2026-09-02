/**
 * `\I[n]` message codes drawn as icons in the editor's own chrome.
 *
 * Element and skill-type names are stored with their icon inside the name -
 * `\I[78]Special`, `\I[64]Fire` - because the System type lists are plain
 * string arrays with nowhere else to put one, and `drawTextEx` expands the
 * code wherever a window draws the name that way. The editor showed the stored string verbatim,
 * so a trait row read "Add \I[78]Special" and every dropdown that named an
 * element showed markup instead of the icon it stands for.
 *
 * These tests pin the three halves of the fix: the RRIconCodes renderer, the
 * two surfaces that call it (the <select> shim and the trait tables), and the
 * fact that the editor page loads it before the shim that needs it.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const codes = require(path.join(editorRoot, 'src', 'utils', 'IconCodes.js'));
const refs = require(path.join(editorRoot, 'src', 'utils', 'PluginDataRefs.js'));

const SHEET = 'file:///project/img/system/IconSet.png';
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');

// ---------------------------------------------------------------------------
// Reading a stored name
// ---------------------------------------------------------------------------

test('the icon a name asks for, and the name without its codes', () => {
    assert.equal(codes.iconIndex('\\I[78]Special'), 78);
    assert.equal(codes.iconIndex('\\i[64]Fire'), 64, 'the code is case-insensitive');
    assert.equal(codes.iconIndex('Fire'), 0, 'no code is index 0, IconSet\'s blank cell');
    assert.equal(codes.iconIndex(null), 0);

    assert.equal(codes.strip('\\I[78]Special'), 'Special');
    assert.equal(codes.strip('\\C[3]\\I[64]Fire'), 'Fire', 'other codes go too');
    assert.equal(codes.strip('Fire'), 'Fire');
    assert.equal(codes.strip(undefined), '');

    assert.equal(codes.hasCode('\\I[78]Special'), true);
    assert.equal(codes.hasCode('Special'), false);
    assert.equal(codes.hasCode('\\C[3]Special'), false, 'only the icon code renders as anything');
});

test('RRIconCodes and RRPluginDataRefs read the same names the same way', () => {
    // The two modules own the same regexes for different surfaces - one
    // renders a stored string, the other resolves an id to a name for a plugin
    // parameter picker. Drift between them would show as an element that has an
    // icon in a dropdown and not in a plugin parameter.
    const corpus = [
        '\\I[78]Special', '\\I[64]Fire', '\\i[65]Ice', 'Physical', '',
        '\\C[3]\\I[77]Rending', '\\I[0]Blank', 'Holy \\I[70]', '\\}Small\\{',
        '\\V[7] Element', '\\I[12]Multi \\I[13]Code'
    ];
    for (const name of corpus) {
        assert.equal(codes.strip(name), refs.stripTextCodes(name), `strip: ${name}`);
        assert.equal(codes.iconIndex(name), refs.iconIndexFor(name), `index: ${name}`);
    }
});

// ---------------------------------------------------------------------------
// Splitting a name into what to draw
// ---------------------------------------------------------------------------

test('a code is drawn where it sits, and the words around it keep their spacing', () => {
    // "Add \I[78]Special" is what a trait row builds. Trimming each run would
    // weld "Add" onto the icon; not trimming at all would pad both ends.
    assert.deepEqual(codes.segments('Add \\I[78]Special'),
        [{ text: 'Add ' }, { icon: 78 }, { text: 'Special' }]);
    assert.deepEqual(codes.segments('\\I[64]Fire 200%'),
        [{ icon: 64 }, { text: 'Fire 200%' }]);
    assert.deepEqual(codes.segments('  \\I[64]Fire  '), [{ icon: 64 }, { text: 'Fire' }]);
    assert.deepEqual(codes.segments('\\I[12]Multi \\I[13]Code'),
        [{ icon: 12 }, { text: 'Multi ' }, { icon: 13 }, { text: 'Code' }]);
    assert.deepEqual(codes.segments('\\I[70]'), [{ icon: 70 }], 'a name that is only an icon');
    assert.deepEqual(codes.segments('Physical'), [{ text: 'Physical' }]);
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

test('the sheet is cropped by index, 16 cells wide at the database list size', () => {
    const css = codes.cellCss(78, SHEET);
    // 78 = row 4, column 14 of a 16-wide sheet drawn at 20px a cell.
    assert.match(css, /background-size: 320px auto;/);
    assert.match(css, /background-position: -280px -80px;/);
    assert.match(css, /width: 20px; height: 20px;/);
    assert.match(css, /background-image: url\("file:\/\/\/project\/img\/system\/IconSet\.png"\);/);
});

test('html() escapes the text and emits one span per icon', () => {
    const html = codes.html('Add \\I[78]Special', { url: SHEET });
    assert.match(html, /^Add <span class="rr-icon-code" style="[^"]+"><\/span>Special$/);
    assert.match(html, /background-position: -280px -80px;/);

    // The trait value is user-entered data reaching a table cell, so it is
    // escaped exactly as rrEscapeHtml would have escaped it.
    assert.equal(codes.html('<b>Fire</b> & "Ice"', { url: SHEET }),
        '&lt;b&gt;Fire&lt;/b&gt; &amp; &quot;Ice&quot;');
});

test('with no IconSet to point at, the code is dropped rather than shown', () => {
    // A closed project or a host that cannot build the URL: showing an empty
    // 20px box would be worse than showing the name alone, and showing the raw
    // code is the behaviour being fixed.
    assert.equal(codes.html('Add \\I[78]Special', { url: '' }), 'Add Special');
    assert.equal(codes.html('\\I[0]Blank', { url: SHEET }), 'Blank', 'index 0 is the blank cell');
});

test('iconSetUrl() answers "" when no project is open', () => {
    assert.equal(codes.iconSetUrl(), '');
});

test('paint() rebuilds an element as icons and text', () => {
    const made = [];
    const makeElement = () => ({
        className: '',
        style: { cssText: '' },
        children: [],
        textContent: '',
        appendChild(child) { this.children.push(child); return child; }
    });
    const context = {
        console,
        document: {
            createElement() { const el = makeElement(); made.push(el); return el; },
            createTextNode(text) { return { text }; }
        }
    };
    context.window = context;
    vm.runInNewContext(read('src/utils/IconCodes.js'), context);

    const target = makeElement();
    context.window.RRIconCodes.paint(target, 'Add \\I[78]Special', { url: SHEET });

    assert.equal(target.children.length, 3);
    assert.deepEqual(target.children[0], { text: 'Add ' });
    assert.equal(target.children[1].className, 'rr-icon-code');
    assert.match(target.children[1].style.cssText, /background-position: -280px -80px;/);
    assert.deepEqual(target.children[2], { text: 'Special' });
});

// ---------------------------------------------------------------------------
// The two surfaces that call it
// ---------------------------------------------------------------------------

test('the <select> shim paints option labels instead of assigning raw text', () => {
    // Every dropdown in the editor is this one div-based popup, which is what
    // makes "show the icon" possible at all - a native <option> could only ever
    // hold text. Covering it here covers the trait dialog, the skill and item
    // skill-type and damage-element selects, and the [SV] Magic Skills rows.
    const source = read('src/utils/SelectThemingShim.js');

    assert.match(source, /const paintLabel = \(target, text\) => \{/);
    assert.match(source, /codes\.paint\(target, text\)/);
    assert.match(source, /paintLabel\(item, opt\.textContent\)/, 'popup rows');
    assert.match(source, /paintLabel\(triggerEl\.querySelector\('\.rr-shim-label'\), opt\.textContent\)/,
        'the trigger after a pick');
    assert.match(source, /paintLabel\(label, getCurrentLabel\(selectEl\)\)/, 'and on refresh');
    assert.doesNotMatch(source, /item\.textContent = opt\.textContent/);
    assert.doesNotMatch(source, /trigger(El)?\.firstChild\.nodeValue/,
        'the label is a span now, not the trigger\'s first text node');

    // Type-to-filter matches the name as shown, so the code's digits do not
    // compete with it and typing a visible name still finds the row. An option
    // carrying an explanation is searchable by that too, so an author who knows
    // what they want but not what it is called can still find it.
    assert.match(source, /item\.dataset\.optText = searchText\(/);
    assert.match(source, /searchText\(`\$\{opt\.textContent\} \$\{hint\}`\)/,
        'the searchable text covers the label and its explanation');
    assert.match(source, /codes \? codes\.strip\(text\) : text/);
});

test('a shimmed dropdown really builds icon cells, in the trigger and the rows', () => {
    // The source assertions above say the calls are written; this runs the shim
    // over a <select> of element names and looks at what came out, which is the
    // half that would still be broken if `.rr-shim-label` were the wrong hook.
    const dom = require('./helpers/mini-dom.cjs');
    const context = dom.createContext();
    vm.runInNewContext(read('src/utils/IconCodes.js'), context);
    // A project the URL builder can resolve, so there is a sheet to crop.
    context.RRAssetFiles = { toUrl: filePath => 'file:///' + String(filePath).replace(/\\/g, '/') };
    context.reactor = { projectController: { getCurrentProject: () => ({ path: '/project' }) } };
    context.require = require;

    const select = dom.createSelect([
        { value: '1', text: '\\I[79]Magick' },
        { value: '2', text: '\\I[78]Special' },
        { value: '3', text: 'Physical' }
    ], '2');
    context.document.body.appendChild(select);
    vm.runInNewContext(read('src/utils/SelectThemingShim.js'), context);

    const trigger = context.document.body.querySelector('.rr-shim-trigger');
    assert.ok(trigger, 'the select was wrapped');
    const label = trigger.querySelector('.rr-shim-label');
    assert.ok(label, 'and the label span the paint calls target exists');
    assert.equal(label.textContent, 'Special', 'the code is gone from the text');
    const triggerIcon = label.querySelector('.rr-icon-code');
    assert.ok(triggerIcon, 'and drawn as an icon instead');
    // 78 = row 4, column 14 of the 16-wide sheet at 20px a cell.
    assert.match(triggerIcon.style.cssText, /background-position: -280px -80px;/);
    assert.match(triggerIcon.style.cssText, /IconSet\.png/);

    trigger.fire('click');
    const rows = context.document.body.querySelectorAll('.rr-shim-popup')[0]
        ? context.document.body.querySelector('.rr-shim-popup').querySelectorAll('div')
        : [];
    // An option row is the one that carries the filter key; the popup's own
    // scroll container is a div too.
    const named = rows.filter(row => row.dataset.optText !== undefined);
    assert.deepEqual(named.map(row => row.textContent), ['Magick', 'Special', 'Physical']);
    assert.equal(named.filter(row => row.querySelector('.rr-icon-code')).length, 2,
        'the two names that carry a code get an icon; the plain one does not');
    assert.deepEqual(named.map(row => row.dataset.optText), ['magick', 'special', 'physical'],
        'and type-to-filter matches the name as shown');
});

test('trait rows render their value through the icon renderer', () => {
    const commonUI = read('src/database/DatabaseCommonUI.js');
    assert.match(commonUI, /getTraitValueHtml\(trait\) \{/);
    assert.match(commonUI, /window\.RRIconCodes[\s\S]{0,80}rrEscapeHtml\(text\)/,
        'and falls back to plain escaping when the renderer is absent');

    for (const file of ['DatabaseActorEditor', 'DatabaseArmorEditor', 'DatabaseClassEditor',
        'DatabaseEnemyEditor', 'DatabaseItemBaseEditor', 'DatabaseStateEditor',
        'DatabaseWeaponEditor']) {
        const source = read(path.join('src', 'database', `${file}.js`));
        assert.match(source, /\$\{this\.commonUI\.getTraitValueHtml\(trait\)\}/, file);
        assert.doesNotMatch(source, /EscapeH[tT][mM][lL]\(this\.commonUI\.getTraitValue\(trait\)\)/, file);
    }
});

test('getTraitValueHtml escapes when the renderer is not loaded', () => {
    const source = read('src/database/DatabaseCommonUI.js');
    // A window without RRIconCodes on it: the editor before this page's
    // scripts have all run, and the condition the fallback actually guards.
    const context = {
        console,
        window: {},
        rrEscapeHtml: require(path.join(editorRoot, 'src', 'utils', 'HtmlEscape.js'))
    };
    const DatabaseCommonUI = vm.runInNewContext(`${source}\nDatabaseCommonUI;`, context);
    const ui = Object.create(DatabaseCommonUI.prototype);
    ui.databaseManager = { getSystem: () => ({ skillTypes: ['', '\\I[79]Magick', '\\I[78]Special'] }) };

    assert.equal(ui.getTraitValueHtml({ code: 41, dataId: 2, value: 0 }), 'Add \\I[78]Special');
});

test('the editor page loads IconCodes before the shim that uses it', () => {
    const html = read('index.html');
    const at = file => html.indexOf(`src="src/utils/${file}"`);
    assert.ok(at('IconCodes.js') > 0, 'IconCodes.js is loaded at all');
    assert.ok(at('IconCodes.js') > at('AssetFiles.js'), 'after the URL builder it calls');
    assert.ok(at('IconCodes.js') < at('SelectThemingShim.js'), 'before the shim');
});

test('the icon cell has a stylesheet rule to size and align it', () => {
    const css = read('css/styles.css');
    assert.match(css, /\.rr-icon-code \{[\s\S]*?image-rendering: pixelated;[\s\S]*?\}/);
});

// ---------------------------------------------------------------------------
// Attack Motions
// ---------------------------------------------------------------------------

test('one shared helper renders a stored name, and getTraitValueHtml uses it', () => {
    const source = read('src/database/DatabaseCommonUI.js');
    assert.match(source, /nameHtml\(text, options\) \{/);
    assert.match(source, /window\.RRIconCodes\.html\(text, options\)/,
        'a caller can size the cell to its own list');
    assert.match(source, /window\.RRIconCodes[\s\S]{0,80}rrEscapeHtml\(text\)/,
        'and falls back to plain escaping when the renderer is absent');
    assert.match(source, /getTraitValueHtml\(trait\) \{\s*\n\s*return this\.nameHtml\(this\.getTraitValue\(trait\)\);/);
});

test('[SV] Attack Motions draws the weapon type name it is showing', () => {
    // Weapon type names carry a code for the same reason element and skill-type
    // names do, and this tab shows them as table text rather than in a select,
    // so the dropdown shim never reached them. Both places that name the type
    // go through the renderer: the row, and the edit dialog's title.
    const source = read('src/database/DatabaseSystem2Editor.js');
    assert.equal(source.match(/this\.commonUI\.nameHtml\(typeName \|\| tt\('\(Bare Hands\)'\)\)/g)?.length, 2,
        'the row and the dialog title');
    assert.doesNotMatch(source, /rrEscapeHtml\(typeName/);
});

test('equip-type slot labels draw their icon too, in both places that show one', () => {
    // The same names the trait rows already draw. Leaving these raw would have
    // made an equip type read as an icon in a trait row and as markup two
    // panels away.
    const actors = read('src/database/DatabaseActorEditor.js');
    assert.match(actors, /\$\{this\.commonUI\.nameHtml\(slotName\)\}/);
    assert.doesNotMatch(actors, /rrEscapeHtml\(slotName\)/);

    // The battle-test dialog builds DOM, and createFormRow assigns textContent,
    // so its label is repainted rather than handed markup it would print.
    const battleTest = read('src/database/BattleTestConfigModal.js');
    assert.match(battleTest, /window\.RRIconCodes\.paint\(row\.querySelector\('label'\), slotName \+ ':'\)/);
    assert.match(battleTest, /window\.RRIconCodes\.hasCode\(slotName\)/);
});

// ---------------------------------------------------------------------------
// Insert Icon
// ---------------------------------------------------------------------------

/** A text input with real setRangeText semantics, and nothing else. */
function makeInput(value) {
    return {
        value,
        isConnected: true,
        selectionStart: 0,
        selectionEnd: 0,
        focused: false,
        events: [],
        focus() { this.focused = true; },
        setRangeText(text, start, end, mode) {
            this.value = this.value.slice(0, start) + text + this.value.slice(end);
            if (mode === 'end') this.selectionStart = this.selectionEnd = start + text.length;
        },
        dispatchEvent(event) { this.events.push(event.type); return true; }
    };
}

function loadDatabaseEditorUI() {
    const window = { RPGReactorHost: {}, RRIconCodes: codes };
    const context = {
        console: { log() {}, warn() {}, error() {} },
        alert() {},
        window,
        require,
        Event: class { constructor(type, options) { Object.assign(this, { type }, options); } }
    };
    const source = read('src/DatabaseEditorUI.js');
    return vm.runInNewContext(`${source}\nDatabaseEditorUI;`, context);
}

test('Insert Icon writes a real \\I[n] code at the range it was given', () => {
    // The code is written from a template literal, where a single backslash is
    // an invalid escape that silently collapses to "I[78]". This test exists
    // because that is exactly what the first version of it shipped as.
    const DatabaseEditorUI = loadDatabaseEditorUI();
    const ui = Object.create(DatabaseEditorUI.prototype);
    ui.currentProject = { path: 'C:/project' };

    let openedOn = null;
    let sheet = null;
    ui.showIconPicker = (current, onSelect, iconSetPath) => {
        openedOn = current;
        sheet = iconSetPath;
        onSelect(78);
    };

    const input = makeInput('Fire');
    ui.insertIconCode(input, 0, 0);

    assert.equal(input.value, '\\I[78]Fire');
    assert.equal(codes.iconIndex(input.value), 78, 'and the renderer reads it back');
    assert.equal(codes.strip(input.value), 'Fire');
    assert.equal(openedOn, 0, 'a name with no code opens the grid at cell 0');
    assert.match(sheet, /IconSet\.png$/);
    assert.deepEqual(input.events, ['input'], 'so the field owner saves it');
    assert.equal(input.focused, true);
});

test('Insert Icon replaces the code a name already carries instead of stacking one', () => {
    const DatabaseEditorUI = loadDatabaseEditorUI();
    const ui = Object.create(DatabaseEditorUI.prototype);
    ui.currentProject = { path: 'C:/project' };
    let openedOn = null;
    ui.showIconPicker = (current, onSelect) => { openedOn = current; onSelect(78); };

    // The range the Types row menu computes for a name that starts with a code.
    const input = makeInput('\\I[64]Fire');
    ui.insertIconCode(input, 0, '\\I[64]'.length);

    assert.equal(input.value, '\\I[78]Fire');
    assert.equal(openedOn, 64, 'and the grid opened on the icon it is replacing');
});

test('Insert Icon declines to write into a field that changed while the grid was open', () => {
    const DatabaseEditorUI = loadDatabaseEditorUI();
    const ui = Object.create(DatabaseEditorUI.prototype);
    ui.currentProject = { path: 'C:/project' };

    const retyped = makeInput('Fire');
    ui.showIconPicker = (current, onSelect) => { retyped.value = 'Ice'; onSelect(78); };
    ui.insertIconCode(retyped, 0, 0);
    assert.equal(retyped.value, 'Ice', 'a different row was selected behind the modal');
    assert.deepEqual(retyped.events, []);

    const removed = makeInput('Fire');
    removed.isConnected = false;
    ui.showIconPicker = (current, onSelect) => onSelect(78);
    ui.insertIconCode(removed, 0, 0);
    assert.equal(removed.value, 'Fire');
});

test('the Types list shows the icon while its editor keeps the code', () => {
    // The two halves of the same panel answer different questions: the column
    // is a list of names to read, the input is the string being edited. Showing
    // the icon in the input would leave no way to type or correct a code.
    const source = read('src/DatabaseEditorUI.js');

    assert.match(source, /<span class="rr-types-name">\$\{this\.commonUI\.nameHtml\(value \|\| '', \{ size: TYPES_ICON_SIZE \}\)\}<\/span>/,
        'the column renders');
    assert.match(source, /name\.innerHTML = this\.commonUI\.nameHtml\(editor\.value, \{ size: TYPES_ICON_SIZE \}\)/,
        'and keeps rendering as the name is typed');
    assert.doesNotMatch(source, /name\.textContent = editor\.value/);

    // The input is still assigned the stored string, unrendered.
    assert.match(source, /editor\.value = system\[category\]\[indices\[0\]\] \|\| ''/);
    assert.doesNotMatch(source, /editor\.value = [^;\n]*nameHtml/);

    // Sized to the row: the default cell would make an icon-bearing row taller
    // than its neighbours in a list that can run to 512 entries.
    assert.match(source, /const TYPES_ICON_SIZE = 14;/);
    const css = read('css/styles.css');
    assert.match(css, /\.rr-types-row \{[\s\S]*?min-height: 23px;/,
        'and 14px still fits the row height the list already had');
});

test('a smaller cell aligns to its own size, not to the default', () => {
    // The stylesheet carries one vertical-align for the default cell; a 14px
    // icon using it would sit low. cellCss emits its own, and agrees with the
    // stylesheet at the default size.
    assert.match(codes.cellCss(78, SHEET), /vertical-align: -5px;/);
    assert.match(codes.cellCss(78, SHEET, 14), /vertical-align: -4px;/);
    assert.match(codes.cellCss(78, SHEET, 14), /width: 14px; height: 14px;/);
    // 14px cells crop from the same 16-wide sheet, just at a smaller scale.
    assert.match(codes.cellCss(78, SHEET, 14), /background-size: 224px auto;/);
    assert.match(codes.cellCss(78, SHEET, 14), /background-position: -196px -56px;/);

    const css = read('css/styles.css');
    assert.match(css, /\.rr-icon-code \{[\s\S]*?vertical-align: -5px;/,
        'the stylesheet default and cellCss default agree');
});

test('Insert Icon is offered on both menus that reach a type or term name', () => {
    const source = read('src/DatabaseEditorUI.js');

    // The shared text-field menu covers the Types name editor and every Terms
    // field, which is what makes this the answer for Terms as well.
    assert.match(source, /label: tt\('Insert Icon\.\.\.'\), action: \(\) => this\.insertIconCode\(input, selectionStart, selectionEnd\)/);
    assert.match(source, /attachTextFieldContextMenu\(input\) \{/);
    // And the Types tab's own row menu, where there is no caret to insert at.
    assert.match(source, /label: tt\('Insert Icon\.\.\.'\), enabled: selectedFor\(category\.key\)\.size === 1/);
    assert.match(source, /const leading = \/\^\\\\I\\\[\\d\+\\\]\/i\.exec\(field\.value\)/,
        'the leading-code probe matches a backslash, not a bare I');
});

test('the Insert Icon label is translated in every locale', () => {
    const source = read('src/I18nManager.js');
    const context = {};
    vm.createContext(context);
    vm.runInContext(
        source.slice(0, source.indexOf('class I18nManager')) + ';__text = RR_TEXT_TRANSLATIONS;',
        context
    );
    const tables = context.__text;
    const missing = Object.keys(tables).filter(locale => !tables[locale]['Insert Icon...']);
    assert.deepEqual(missing, []);
    assert.equal(tables.ja['Insert Icon...'], 'アイコンを挿入...');
});
