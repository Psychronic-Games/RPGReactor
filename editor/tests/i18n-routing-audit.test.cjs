const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { inventoryLocalizationSource } = require('./helpers/i18n-source-audit.cjs');

const editorRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');
const phrases = (source, file = 'src/Fixture.js') => Array.from(inventoryLocalizationSource(source, file).keys()).sort();

test('the source inventory follows file-local t/text helpers but not keyed or widget calls', () => {
    const source = `
        const t = text => window.I18n ? window.I18n.tText(text) : text;
        class Panel {
            text(value) { return window.I18n.tText(value); }
            render() {
                t('Local helper');
                this.text('Method helper');
                window.I18n.t('menu.keyed');
                this.ui.text('Widget call');
            }
        }`;
    assert.deepEqual(phrases(source), ['Local helper', 'Method helper']);
});

test('the source inventory follows helpers that translate one of their parameters', () => {
    const source = `
        class Editor {
            _t(text) { return window.I18n.tText(text); }
            _field(parent, label, key) { parent.append(this._t(label)); return key; }
            static _field(args, key) { return args[key]; }
            build(grid) {
                this._field(grid, 'Surface ID', 'id');
                this._field(grid, 'Playback Rate', 'playbackRate');
                Editor._field(raw, 'corners');
            }
        }`;
    assert.deepEqual(phrases(source), ['Playback Rate', 'Surface ID']);
});

test('countText phrases and the Resource Manager labels are inventoried', () => {
    const counted = `class R { text(v) { return window.I18n.tText(v); } countText(n, one, many) { return n === 1 ? this.text(one) : this.text(many); }
        go(n) { this.countText(n, '1 file.', '{count} files.'); } }`;
    assert.deepEqual(phrases(counted), ['1 file.', '{count} files.']);

    const resources = phrases(read('src/ResourceManager.js'), 'src/ResourceManager.js');
    for (const phrase of ['Battlebacks 1', 'SV Actors', 'Application Icons', 'Refresh', 'Import destination:', 'Resource folders',
        'Select a resource to preview.', 'Stored as', 'Delete resource?', '{count} resources selected.']) {
        assert.ok(resources.includes(phrase), phrase);
    }
});

test('Resource Manager, map deletion and other rebuilt messages are whole translatable phrases', () => {
    const resources = read('src/ResourceManager.js');
    const englishStatuses = [...resources.matchAll(/setStatus\(`([^`]*)`/g)]
        .map(match => match[1].replace(/\$\{[^}]*\}/g, '')).filter(rest => /[A-Za-z]/.test(rest));
    assert.deepEqual(englishStatuses, [], 'no status is built from English fragments');
    assert.doesNotMatch(resources, /showConfirm\(\s*'/, 'confirm titles are translated');
    assert.match(resources, /this\.localize\(\);\s*\n\s*this\.overlay\.style\.display = 'flex'/, 'labels follow a language switch');

    const project = read('src/ProjectController.js');
    assert.doesNotMatch(project, /this\._tt\('This removes its'\)/);
    assert.match(project, /'Delete "\{name\}"\?\\n\\nThis removes its \{file\} file and MapInfos entry\.'/);
    assert.match(project, /'Battle Rooms using these maps: \{troops\}\. Select replacement maps in Troops after deletion\.'/);

    assert.match(read('src/TilesetPaletteViewer.js'), /tt\('Selected: \{width\}x\{height\} tiles \(\{count\} tiles\) on layer \{layer\}'\)/);
    assert.match(read('src/event/commands/AudioCommandEditor.js'), /tt\('No \{folder\} files found'\)/);
    assert.match(read('src/LegacyImportDialog.js'), /tt\('The import worker stopped \(exit code \{code\}\)\.'\)/);
    assert.match(read('src/LegacyImportDialog.js'), /o\.textContent = tt\(value \? text : 'Automatic'\)/);
    assert.match(read('src/MediaSurfacePreviewManager.js'), /handle\.title = [^;]*tText\(spec\.label\)/);
    assert.match(read('src/event/commands/MediaSurfaceEditor.js'), /'\{label\} must be between \{min\} and \{max\}\.'/);
    assert.match(read('src/forge/ProjectTools/ProjectTools.js'), /this\._saveFailureText\(err\.message\)/);
});

test('gamepad D-pad names translate while printed button names stay', () => {
    const source = read('src/database/DatabaseControlsEditor.js');
    const sandbox = { window: { I18n: { tText: text => `«${text}»` } } };
    const Editor = vm.runInNewContext(`${source}\nDatabaseControlsEditor`, sandbox);
    assert.equal(Editor.buttonName(0), 'A');
    assert.equal(Editor.buttonName(12), '«D-pad Up»');
    assert.equal(Editor.buttonName(20), '«Button {n}»'.replace('{n}', '20'));
});

// A small DOM: enough for I18nManager.setLanguage to walk text and attributes.
function miniDocument() {
    class Element {
        constructor(tag, attrs = {}) { this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.childNodes = []; this.parentElement = null; this.nodeType = 1; }
        append(...nodes) { for (const node of nodes) { node.parentElement = this; this.childNodes.push(node); } return this; }
        getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }
        setAttribute(name, value) { this.attrs[name] = String(value); }
        hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
        matches(selector) {
            return selector.split(',').map(part => part.trim()).some(part => {
                const attribute = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part);
                if (attribute) return this.hasAttribute(attribute[1]) && (attribute[2] === undefined || this.attrs[attribute[1]] === attribute[2]);
                return this.tagName === part.toUpperCase();
            });
        }
        closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
        elements() { return this.childNodes.filter(node => node.nodeType === 1).flatMap(node => [node, ...node.elements()]); }
        querySelectorAll(selector) {
            const attribute = /^\[([\w-]+)\]$/.exec(selector);
            return attribute ? this.elements().filter(node => node.hasAttribute(attribute[1])) : [];
        }
    }
    const text = value => ({ nodeType: 3, nodeValue: value, parentElement: null });
    const body = new Element('body');
    const document = {
        body, documentElement: {}, readyState: 'complete', addEventListener() {},
        querySelectorAll: () => [],
        createTreeWalker(root) {
            const texts = [];
            const visit = node => node.childNodes.forEach(child => (child.nodeType === 3 ? texts.push(child) : visit(child)));
            visit(root);
            let index = 0;
            return { nextNode: () => texts[index++] || null };
        }
    };
    return { document, Element, text, body };
}

test('a language switch re-translates labels a page wrote with tText or t directly', () => {
    const { document, Element, text, body } = miniDocument();
    const store = new Map([['rr-settings', JSON.stringify({ language: 'de' })]]);
    const window = { dispatchEvent() {}, document };
    const sandbox = {
        window, document,
        localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
    };
    window.localStorage = sandbox.localStorage;
    const source = ['I18nDeepTranslations.js', 'I18nReviewedTranslations.js', 'I18nManager.js']
        .map(file => fs.readFileSync(path.join(editorRoot, 'src', file), 'utf8')).join('\n');
    const I18n = vm.runInNewContext(`${source}\nwindow.I18n`, sandbox);
    I18n.setLanguage('de', { persist: false });

    const label = new Element('span').append(text(I18n.tText('Refresh')));
    const mixed = new Element('label').append(new Element('input'), text(` ${I18n.tText('Muted')}`));
    const close = new Element('button', { title: I18n.tText('Resource Manager') });
    const heading = new Element('h2').append(text(I18n.t('menu.resourceManager')));
    const typed = new Element('textarea').append(text(I18n.tText('Refresh')));
    const skipped = new Element('div', { 'data-rr-i18n-skip': '' }).append(text(I18n.tText('Refresh')));
    body.append(label, mixed, close, heading, typed, skipped);
    const german = label.childNodes[0].nodeValue;
    assert.notEqual(german, 'Refresh', 'German is shown first');

    I18n.setLanguage('fr', { persist: false });
    const french = phrase => vm.runInNewContext('RR_TEXT_TRANSLATIONS.fr', sandbox)[phrase];
    assert.equal(label.childNodes[0].nodeValue, french('Refresh'));
    assert.equal(mixed.childNodes[1].nodeValue, ` ${french('Muted')}`, 'surrounding spaces kept');
    assert.equal(close.getAttribute('title'), french('Resource Manager'));
    assert.equal(heading.childNodes[0].nodeValue, I18n.t('menu.resourceManager'));
    assert.equal(typed.childNodes[0].nodeValue, german, 'typed text is left alone');
    assert.equal(skipped.childNodes[0].nodeValue, german, 'skipped regions are left alone');

    I18n.setLanguage('en', { persist: false });
    assert.equal(label.childNodes[0].nodeValue, 'Refresh', 'back to English');
});

test('the map info bar lays its halves out in one row instead of overlapping', () => {
    const css = read('css/styles.css');
    const rule = selector => (css.match(new RegExp(`\\n\\s*${selector.replace(/[#-]/g, '\\$&')} \\{([^}]*)\\}`)) || [])[1] || '';
    assert.match(rule('#map-info-content'), /justify-content: space-between/);
    assert.match(rule('#map-info-left'), /min-width: 0/);
    assert.doesNotMatch(rule('#map-info-left') + rule('#map-info-right'), /position: absolute/);
    assert.match(read('src/main.js'), /mapInfoContent\.style\.display = 'flex'/);
});
