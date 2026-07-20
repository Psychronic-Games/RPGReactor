const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const escapeHtml = require(path.join(editorRoot, 'src', 'utils', 'HtmlEscape.js'));
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));

test('event message color preview escapes source text before adding controlled spans', () => {
    const formatter = Object.create(EventCommandList.prototype);
    const payload = '<img src=x onerror="globalThis.injected=true">\\C[6]Gold & safe';

    const html = formatter.convertTextCodesToHTML(payload);

    assert.doesNotMatch(html, /<img|onerror="/i);
    assert.match(html, /&lt;img src=x onerror=&quot;globalThis\.injected=true&quot;&gt;/);
    assert.match(html, /<span style="color: #ffff80">Gold &amp; safe<\/span>/);
});

test('database trait options escape project-authored names', () => {
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTraitEditor.js'), 'utf8');
    const context = {
        rrEscapeHtml: escapeHtml,
        window: { I18n: null },
        console
    };
    const DatabaseTraitEditor = vm.runInNewContext(`${source}\nDatabaseTraitEditor;`, context);
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

test('CharacterGenerator denies project JavaScript until that project is explicitly trusted', t => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-cg-trust-'));
    t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));
    const partDir = path.join(
        projectPath, 'forge', 'character_generator', 'styles', 'custom', 'parts', 'body');
    fs.mkdirSync(partDir, { recursive: true });
    fs.writeFileSync(path.join(partDir, 'payload.js'),
        'globalThis.rrProjectPartExecuted = true; RR_CHARACTER_REGISTRY.push({ id: "project-part", tags: [] });\n');

    const storageValues = new Map();
    const localStorage = {
        getItem: key => storageValues.get(key) ?? null,
        setItem: (key, value) => storageValues.set(key, String(value)),
        removeItem: key => storageValues.delete(key)
    };
    const registry = [];
    const source = fs.readFileSync(path.join(
        editorRoot, 'src', 'forge', 'CharacterGenerator', 'CharacterGenerator.js'), 'utf8');
    const context = {
        console,
        globalThis: null,
        localStorage,
        process,
        require,
        RR_CHARACTER_REGISTRY: registry,
        window: { RPGReactorHost: { mode: 'desktop' }, addEventListener() {} }
    };
    context.globalThis = context;
    const CharacterGenerator = vm.runInNewContext(`${source}\nCharacterGenerator;`, context);
    const generator = new CharacterGenerator();
    generator.projectPath = projectPath;

    assert.equal(generator._loadProjectProceduralParts(), false);
    assert.equal(context.rrProjectPartExecuted, undefined);
    assert.deepEqual(registry, []);

    assert.equal(generator._setProjectCodeTrusted(true, localStorage), true);
    assert.equal(generator._loadProjectProceduralParts(), true);
    assert.equal(context.rrProjectPartExecuted, true);
    assert.equal(registry.some(part => part.id === 'project-part'), true);
});

test('CharacterGenerator folder opening uses argument-array execFile', () => {
    const source = fs.readFileSync(path.join(
        editorRoot, 'src', 'forge', 'CharacterGenerator', 'CharacterGenerator.js'), 'utf8');
    assert.match(source, /\.execFile\(command, \[root\]\)/);
    assert.doesNotMatch(source, /child_process['"]\)\.exec\s*\(/);
});
