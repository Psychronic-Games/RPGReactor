const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

function loadBrowserClass(filePath, className) {
    const source = fs.readFileSync(filePath, 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console,
        require,
        nw: {},
        alert: () => {}
    });
}

function parsePluginsFile(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const match = text.match(/var\s+\$plugins\s*=\s*(\[[\s\S]*\]);/);
    assert.ok(match, 'plugins.js contains a $plugins array');
    return JSON.parse(match[1]);
}

test('PluginManager writes MZ-compatible plugins.js without Reactor-only metadata', async () => {
    const PluginManager = loadBrowserClass(path.join(repoRoot, 'src', 'PluginManager.js'), 'PluginManager');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-plugin-test-'));
    const projectPath = path.join(tempRoot, 'MZ Project');
    const jsPath = path.join(projectPath, 'js');
    fs.mkdirSync(jsPath, { recursive: true });

    try {
        const manager = new PluginManager({
            getCurrentProject: () => ({ path: projectPath })
        });
        manager.fs = fs;
        manager.path = path;
        manager._pluginsFilePath = path.join(jsPath, 'plugins.js');
        manager.plugins = [{
            name: 'ExamplePlugin',
            status: true,
            description: 'Example plugin.',
            author: 'Reactor UI only',
            url: 'https://example.com',
            help: 'Long parsed help text for the Reactor details panel.',
            parameters: {
                NumberValue: 10,
                BooleanValue: true,
                NullValue: null
            }
        }];

        await manager.savePlugins();

        const savedPlugins = parsePluginsFile(manager._pluginsFilePath);
        assert.deepEqual(Object.keys(savedPlugins[0]), ['name', 'status', 'description', 'parameters']);
        assert.equal(savedPlugins[0].name, 'ExamplePlugin');
        assert.equal(savedPlugins[0].status, true);
        assert.equal(savedPlugins[0].description, 'Example plugin.');
        assert.deepEqual(savedPlugins[0].parameters, {
            NumberValue: '10',
            BooleanValue: 'true',
            NullValue: ''
        });
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
