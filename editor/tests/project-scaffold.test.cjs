const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, describe, test } = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(editorRoot, '..');

function loadBrowserClass(filePath, className) {
    const source = fs.readFileSync(filePath, 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console,
        process,
        require,
        nw: {}
    });
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseRuntimeReferences(mainPath) {
    const source = fs.readFileSync(mainPath, 'utf8');
    const scripts = source.match(/const\s+scriptUrls\s*=\s*(\[[\s\S]*?\]);/);
    const wasm = source.match(/const\s+effekseerWasmUrl\s*=\s*(["'][^"']+["'])\s*;/);
    assert.ok(scripts && wasm, 'generated reactor_main.js has a complete manifest');
    return [
        ...Array.from(vm.runInNewContext(scripts[1])),
        vm.runInNewContext(wasm[1])
    ];
}

describe('generated fallback project scaffold', () => {
    let tempRoot;
    let projectPath;

    before(async () => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-scaffold-'));
        projectPath = path.join(tempRoot, 'Starter RPG');
        fs.cpSync(path.join(workspaceRoot, 'runtime'), path.join(tempRoot, 'runtime'), { recursive: true });
        fs.writeFileSync(
            path.join(tempRoot, 'package.json'),
            JSON.stringify({ version: '0.94.2' }),
            'utf8'
        );

        const ProjectManager = loadBrowserClass(path.join(editorRoot, 'src', 'ProjectManager.js'), 'ProjectManager');
        const previousCwd = process.cwd();
        process.chdir(tempRoot);
        try {
            const created = await new ProjectManager().createNewProject(projectPath, 'Starter RPG');
            assert.equal(created, true, 'fallback project is created');
        } finally {
            process.chdir(previousCwd);
        }
    });

    after(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('contains all runtime and database files needed at startup', () => {
        const mainPath = path.join(projectPath, 'js', 'reactor_main.js');
        for (const reference of parseRuntimeReferences(mainPath)) {
            assert.equal(
                fs.existsSync(path.join(projectPath, reference)),
                true,
                `${reference} exists in the generated project`
            );
        }

        const managerSource = fs.readFileSync(path.join(projectPath, 'js', 'reactor_managers.js'), 'utf8');
        const databaseFiles = [...managerSource.matchAll(/src:\s*"([A-Za-z]+\.json)"/g)]
            .map((match) => match[1]);
        assert.ok(databaseFiles.length > 0, 'runtime database manifest was derived');
        for (const fileName of databaseFiles) {
            const filePath = path.join(projectPath, 'data', fileName);
            assert.equal(fs.existsSync(filePath), true, `${fileName} exists`);
            const data = readJson(filePath);
            if (fileName === 'System.json') {
                assert.equal(Array.isArray(data), false, 'System.json contains an object');
            } else {
                assert.equal(Array.isArray(data), true, `${fileName} contains an array`);
                assert.equal(data[0], null, `${fileName} preserves RPG Maker's null index zero`);
            }
        }
    });

    test('starter database references a consistent map and tileset', () => {
        const system = readJson(path.join(projectPath, 'data', 'System.json'));
        const mapInfos = readJson(path.join(projectPath, 'data', 'MapInfos.json'));
        const map = readJson(path.join(projectPath, 'data', 'Map001.json'));
        const tilesets = readJson(path.join(projectPath, 'data', 'Tilesets.json'));

        assert.equal(mapInfos[0], null);
        assert.equal(mapInfos[system.startMapId].id, system.startMapId);
        assert.equal(mapInfos[system.startMapId].name, 'Map001');
        assert.equal(tilesets[map.tilesetId].id, map.tilesetId);
        assert.equal(system.startX >= 0 && system.startX < map.width, true);
        assert.equal(system.startY >= 0 && system.startY < map.height, true);
        assert.equal(map.events[0], null);
    });

    test('starter map has six complete MZ data layers', () => {
        const map = readJson(path.join(projectPath, 'data', 'Map001.json'));

        assert.equal(map.width, 17);
        assert.equal(map.height, 13);
        assert.equal(map.data.length, map.width * map.height * 6);
        assert.equal(map.data.every((tileId) => tileId === 0), true);
    });

    test('starter System advanced settings contain required MZ runtime values', () => {
        const { advanced, attackMotions } = readJson(path.join(projectPath, 'data', 'System.json'));

        assert.deepEqual(advanced, {
            fallbackFonts: 'Verdana, sans-serif',
            fontSize: 26,
            gameId: 0,
            mainFontFilename: '',
            numberFontFilename: '',
            screenHeight: 624,
            screenScale: 1,
            screenWidth: 816,
            uiAreaHeight: 624,
            uiAreaWidth: 816,
            windowOpacity: 192
        });
        assert.equal(attackMotions.length, 13);
        assert.deepEqual(attackMotions[1], { type: 1, weaponImageId: 1 });
    });

    test('starter plugin configuration is empty', () => {
        const pluginsPath = path.join(projectPath, 'js', 'reactor_plugins.js');
        const source = fs.readFileSync(pluginsPath, 'utf8');
        const plugins = vm.runInNewContext(`${source}\n$plugins;`);

        assert.equal(Array.isArray(plugins), true);
        assert.equal(plugins.length, 0, 'new projects do not inherit demo plugins');
    });

    test('starter project includes valid generated system images', () => {
        const expected = [
            ['Window.png', 192, 192],
            ['IconSet.png', 512, 512]
        ];
        for (const [name, width, height] of expected) {
            const png = fs.readFileSync(path.join(projectPath, 'img', 'system', name));
            assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
            assert.equal(png.readUInt32BE(16), width, `${name} width`);
            assert.equal(png.readUInt32BE(20), height, `${name} height`);
        }
    });
});
