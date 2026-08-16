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
