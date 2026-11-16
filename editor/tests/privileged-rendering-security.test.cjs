const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { paramNamesSource } = require('./helpers/param-names.cjs');

const editorRoot = path.resolve(__dirname, '..');
const escapeHtml = require(path.join(editorRoot, 'src', 'utils', 'HtmlEscape.js'));
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));

test('event message color preview escapes source text before adding controlled spans', () => {
    const formatter = Object.create(EventCommandList.prototype);
    const payload = '<img src=x onerror="globalThis.injected=true">\\C[6]Gold & safe';

    const html = formatter.convertTextCodesToHTML(payload);

    assert.doesNotMatch(html, /<img|onerror="/i);
    assert.match(html, /&lt;img src=x onerror=&quot;globalThis\.injected=true&quot;&gt;/);
    assert.match(html, /<span class="rr-message-code-color" style="color: #ffff80">Gold &amp; safe<\/span>/);
});

test('database trait options escape project-authored names', () => {
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTraitEditor.js'), 'utf8');
    const context = {
        rrEscapeHtml: escapeHtml,
        window: { I18n: null },
        console
    };
    const DatabaseTraitEditor = vm.runInNewContext(
        `${paramNamesSource()}\n${source}\nDatabaseTraitEditor;`, context);
    const editor = Object.create(DatabaseTraitEditor.prototype);
    editor.databaseManager = {
        getSystem: () => ({ elements: ['', 'Fire'] }),
        getStates: () => [{ id: 1, name: '</option><img src=x onerror=alert(1)>' }]
    };
    editor.setupRadioInputs = () => {};
    let html = '';
    const container = {
        set innerHTML(value) { html = value; },
        get innerHTML() { return html; }
    };

    editor.createRatesTab(container, { code: 13, dataId: 1, value: 1 });

    assert.doesNotMatch(html, /<img/i);
    assert.match(html, /&lt;\/option&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('generic database details render project JSON as text', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    const created = [];
    const document = {
        createElement(tagName) {
            const element = {
                tagName,
                style: {},
                children: [],
                textContent: '',
                append(...children) { this.children.push(...children); }
            };
            created.push(element);
            return element;
        }
    };
    const DatabaseEditorUI = vm.runInNewContext(`${source}\nDatabaseEditorUI;`, {
        console,
        document,
        window: { I18n: null }
    });
    const editor = Object.create(DatabaseEditorUI.prototype);
    const container = { appendChild(child) { this.child = child; } };
    const payload = '</pre><img src=x onerror=alert(1)>';

    editor.showGenericDetail(container, { id: 1, name: payload, note: payload }, 'unknown');

    assert.equal(container.child.children[0].textContent, payload);
    assert.match(container.child.children[1].textContent, /<img src=x onerror=alert\(1\)>/);
    assert.equal(created.some(element => Object.hasOwn(element, 'innerHTML')), false);
});
