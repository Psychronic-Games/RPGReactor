/**
 * A new project copies the template project without the template's editor lock,
 * saves, backups, screenshots or battle-test database copies. With the Demo open
 * its .rpgreactor.lock named this editor's own live pid, so the new project
 * refused to open as "already open in another RPG Reactor instance".
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadProjectManager() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'ProjectManager.js'), 'utf8');
    return vm.runInNewContext(`${source}\nProjectManager;`, {
        console: { log() {}, debug() {}, warn() {}, error() {} }, process, require, nw: {},
        RRJson: { parse: text => JSON.parse(String(text)), stringify: value => JSON.stringify(value) }
    });
}

test('a new project leaves the template\'s lock, saves and test copies behind', async () => {
    const ProjectManager = loadProjectManager();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-template-copy-'));
    const previousCwd = process.cwd();
    try {
        const template = path.join(root, 'template', 'Demo');
        const write = (rel, text = '{}') => {
            fs.mkdirSync(path.dirname(path.join(template, rel)), { recursive: true });
            fs.writeFileSync(path.join(template, rel), text);
        };
        write('project.rpgreactor', JSON.stringify({ name: 'Demo' }));
        write('.rpgreactor.lock', JSON.stringify({ app: 'RPG Reactor', pid: process.pid }));
        write('data/System.json', JSON.stringify({ gameTitle: 'Demo' }));
        write('data/Map001.json');
        write('data/Test_System.json');
        write('save/file1.rmmzsave', 'x');
        write('Backup/data/Map001.json');
        write('img/pictures/Test_Card.png', 'x');
        write('js/plugins/Test_Plugin.js', '');
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.98.9' }));
        process.chdir(root);
        const manager = new ProjectManager();
        manager.getRuntimePath = () => null;
        const target = path.join(root, 'Made');
        assert.equal(await manager.createNewProject(target, 'Made'), true, manager.lastCreateError);
        for (const kept of ['data/System.json', 'data/Map001.json', 'img/pictures/Test_Card.png', 'js/plugins/Test_Plugin.js']) {
            assert.ok(fs.existsSync(path.join(target, kept)), `${kept} is copied`);
        }
        for (const left of ['.rpgreactor.lock', 'data/Test_System.json', 'save', 'Backup']) {
            assert.equal(fs.existsSync(path.join(target, left)), false, `${left} stays with the template`);
        }
    } finally {
        process.chdir(previousCwd);
        fs.rmSync(root, { recursive: true, force: true });
    }
});
