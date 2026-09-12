const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const managerSource = fs.readFileSync(path.join(editorRoot, 'src', 'I18nManager.js'), 'utf8');

function loadManager(savedLanguage = null, deepTranslations = {}) {
    const settings = savedLanguage ? JSON.stringify({ language: savedLanguage }) : null;
    const sandbox = {
        RR_DEEP_TEXT_TRANSLATIONS: deepTranslations,
        window: { dispatchEvent() {} },
        document: {
            readyState: 'complete', documentElement: {},
            addEventListener() {}, querySelectorAll() { return []; }
        },
        localStorage: {
            getItem() { return settings; },
            setItem() {}
        },
        CustomEvent: class CustomEvent {}
    };
    sandbox.globalThis = sandbox;
    sandbox.window.document = sandbox.document;
    sandbox.window.localStorage = sandbox.localStorage;
    sandbox.window.CustomEvent = sandbox.CustomEvent;
    return vm.runInNewContext(`${managerSource}\nwindow.I18n;`, sandbox);
}

test('deep translations fill gaps without replacing curated Simplified Chinese terms', () => {
    const manager = loadManager(null, {
        'zh-Hans': { Class: '级别', 'Machine-only phrase': '机器补充' }
    });
    manager.setLanguage('zh-Hans', { persist: false });

    assert.equal(manager.tText('Class'), '职业');
    assert.equal(manager.tText('Machine-only phrase'), '机器补充');
});

test('trusted Simplified Chinese terminology and height toolbar labels are retained', () => {
    const manager = loadManager();
    manager.setLanguage('zh-Hans', { persist: false });
    const expected = {
        Class: '职业', Critical: '会心', Comment: '注释', 'Common Event:': '公共事件：',
        'Change HP': '更改 HP', 'Change MP': '更改 MP', 'Change Enemy MP': '更改敌人 MP',
        'Above Character': '在角色上方', AGI: 'AGI', Count: '数量', Close: '关闭'
    };

    for (const [source, translation] of Object.entries(expected)) {
        assert.equal(manager.tText(source), translation, source);
    }
    assert.equal(manager.t('toolbar.title.heightBrush'), '高度画笔（绘制 3D 地图的高程）');
    assert.equal(manager.t('toolbar.height'), '高度：');
    assert.equal(manager.t('toolbar.height.set'), '设置为');
    assert.equal(manager.t('toolbar.height.raise'), '升高');
    assert.equal(manager.t('toolbar.height.lower'), '降低');
});

test('Chinese regional and underscore locale aliases normalize to script locales', () => {
    for (const alias of ['zh-CN', 'zh_CN', 'zh-SG']) {
        assert.equal(loadManager(alias).currentLanguage(), 'zh-Hans', alias);
    }
    for (const alias of ['zh-TW', 'zh_TW', 'zh-HK', 'zh_HK', 'zh-MO', 'zh_MO']) {
        assert.equal(loadManager(alias).currentLanguage(), 'zh-Hant', alias);
    }

    const manager = loadManager();
    manager.setLanguage('zh_HK', { persist: false });
    assert.equal(manager.currentLanguage(), 'zh-Hant');
    manager.setLanguage('zh_CN', { persist: false });
    assert.equal(manager.currentLanguage(), 'zh-Hans');
});

function loadReviewedEditor(language = 'zh-Hans') {
    const { createContext } = require('./helpers/mini-dom.cjs');
    const context = createContext({
        dispatchEvent() {},
        localStorage: { getItem() { return JSON.stringify({ language }); }, setItem() {} },
        CustomEvent: class {}
    });
    const createElement = context.document.createElement;
    context.document.createElement = tag => {
        const element = createElement(tag);
        if (tag === 'input' || tag === 'textarea') element.value = '';
        Object.defineProperty(element, 'innerHTML', {
            set(value) {
                assert.equal(value, '', 'the reference panel only clears markup');
                this.textContent = '';
            }
        });
        return element;
    };
    vm.createContext(context);
    for (const file of ['I18nDeepTranslations.js', 'I18nReviewedTranslations.js', 'I18nManager.js',
        'utils/TextCodes.js', 'utils/TextCodeMenu.js']) {
        vm.runInContext(fs.readFileSync(path.join(editorRoot, 'src', file), 'utf8'), context);
    }
    return context;
}

test('community-reviewed Chinese wording wins in the complete editor load order', () => {
    const context = loadReviewedEditor('zh_CN');
    const manager = context.I18n;
    const terms = {
        Class: '职业', Critical: '暴击', AGI: '敏捷', Rates: '抗性', Param: '能力值',
        'State Resist': '状态免疫', 'Ex-Parameter': '追加能力值',
        'Input Number': '处理数值输入', 'Show Text': '显示文字',
        'Control Self Switch': '操作独立开关', 'Change Enemy MP': '增减敌方角色MP',
        'Loading model...': '正在加载模型…', 'Presentation': '呈现方式',
        'One argument per line: name=value': '每行一个参数：name=value'
    };
    for (const [source, expected] of Object.entries(terms)) assert.equal(manager.tText(source), expected, source);
    for (const source of ['Input Number', 'Show Text', 'Control Self Switch', 'Change Enemy MP']) {
        assert.equal(manager.tEventCommandName(source), terms[source], source);
    }
    assert.equal(manager.tDbType('actionSequences'), '动作序列');
    assert.equal(manager.t('sidebar.tilesetPalette'), '图块集面板');
    assert.equal(manager.t('toolbar.title.videoPreviews'), '显示媒体界面预览');
    assert.equal(manager.t('about.version'), `RPG Reactor v${require('../package.json').version}`);
    assert.equal(manager.t('db.search', { title: '角色' }), '搜索角色...');
});

test('text-code reference translates and searches Chinese without changing inserted codes or other locales', () => {
    const context = loadReviewedEditor();
    const field = context.document.createElement('textarea');
    field.value = ''; field.selectionStart = 0; field.selectionEnd = 0;
    field.setSelectionRange = (start, end) => { field.selectionStart = start; field.selectionEnd = end; };
    const panel = context.RRTextCodeMenu.createReferencePanel(field);
    const rows = () => panel.children[3].children.filter(row => row._rrCode);
    const variableRow = () => rows().find(row => row._rrCode.code === '\\V[n]');
    const source = 'Replaced with the value of the nth variable.';
    assert.equal(variableRow().children[1].textContent, '替换为第 n 个变量的值。');
    assert.equal(variableRow()._rrCode.detail, source);

    const filter = panel.children[1];
    filter.value = '变量'; filter.dispatchEvent({ type: 'input' });
    assert.equal(rows().length, 1);
    assert.equal(rows()[0]._rrCode.code, '\\V[n]');
    filter.value = 'currency'; filter.dispatchEvent({ type: 'input' });
    assert.equal(rows()[0]._rrCode.code, '\\G', 'English help remains searchable');
    rows()[0].dispatchEvent({ type: 'dblclick', preventDefault() {} });
    assert.equal(field.value, '\\G', 'insertion uses the original code');

    filter.value = '';
    for (const language of ['en', 'zh-Hant', 'ja', 'fr', 'zh-Hans']) {
        context.I18n.setLanguage(language, { persist: false });
        panel.refresh();
        assert.equal(variableRow().children[1].textContent,
            language === 'zh-Hans' ? '替换为第 n 个变量的值。' : source, language);
    }
});
