'use strict';
// The top menu bar reaches everything the sidebar and toolbar reach: every
// database category, every toolbar tool, every Forge tool. A category or tool
// added elsewhere without a menu entry fails here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');

function submenu(name) {
    // From this submenu's opening tag to the next menu heading (or the end of the bar).
    const start = html.indexOf(`id="submenu-${name}"`);
    assert.ok(start >= 0, `submenu-${name} is present`);
    const bar = html.indexOf('id="main-content"', start);
    const next = html.indexOf('class="html-menu-item"', start);
    return html.slice(start, next >= 0 && next < bar ? next : bar);
}

function attributeValues(source, attribute) {
    return Array.from(source.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g')), m => m[1]);
}

test('the Database menu lists the sidebar\'s sections, each opening its first page', () => {
    const vm = require('node:vm');
    const ui = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    const Editor = vm.runInNewContext(`${ui}\nDatabaseEditorUI;`, { console });
    // Copied out of the vm realm, so deepEqual compares values only.
    const sections = JSON.parse(JSON.stringify(Editor.NAV_SECTIONS));
    assert.ok(sections.length >= 4 && sections.length <= 6, 'a handful of sections');
    const menu = submenu('database');
    assert.deepEqual(attributeValues(menu, 'data-db'), sections.map(section => section.pages[0].type));
    assert.deepEqual(attributeValues(menu, 'data-i18n-text-source'), sections.map(section => section.name));
    // Every page is in exactly one section.
    const pages = sections.flatMap(section => section.pages.map(page => page.type));
    assert.equal(new Set(pages).size, pages.length);
    for (const type of ['actors', 'enemies', 'troops', 'states', 'animations', 'tilesets', 'reactor3d', 'vehicles', 'structures', 'commonEvents',
        'userInterfaces', 'actionSequences', 'quests', 'musicSequences', 'system1', 'system2', 'types', 'terms', 'controls']) assert.ok(pages.includes(type), type);
});

test('every toolbar tool opens from a menu too', () => {
    const toolbar = html.slice(html.indexOf('<span class="toolbar-label" data-i18n="toolbar.tools">'), html.indexOf('id="main-content"'));
    const toolbarActions = attributeValues(toolbar, 'data-action');
    const menuActions = new Set(attributeValues(html.slice(html.indexOf('id="html-menu-bar"'), html.indexOf('id="main-content"')), 'data-action'));
    // Two toolbar buttons open surfaces that have a whole menu of their own.
    const standIn = { 'open-database': 'database', 'open-plugins': 'manage-plugins' };
    const missing = toolbarActions.filter(action => {
        const menuAction = standIn[action] || action;
        return !(menuActions.has(menuAction) || html.includes(`data-menu="${menuAction}"`));
    });
    assert.deepEqual(missing, []);
    assert.ok(toolbarActions.includes('build-tool'));
    // Lighting and Media Surfaces are Build bar slots and Tools entries, not toolbar buttons too.
    assert.ok(!toolbarActions.includes('lighting-tool') && !toolbarActions.includes('media-surfaces'));
    assert.ok(menuActions.has('lighting-tool') && menuActions.has('media-surfaces'));
});

test('the Forge lists its tools once: in its own sidebar, with one menu entry that opens it', () => {
    const forge = fs.readFileSync(path.join(editorRoot, 'src', 'forge', 'ForgeManager.js'), 'utf8');
    const tools = Array.from(forge.matchAll(/^\s+id: '([a-z-]+)',/gm), m => m[1]);
    assert.ok(tools.length >= 5, 'FORGE_TOOLS is read');
    assert.deepEqual(attributeValues(submenu('forge'), 'data-action'), ['forge-launcher']);
    assert.doesNotMatch(forge, /rr-forge-tile|_renderWelcome/, 'no second list of tiles beside the sidebar');
    assert.match(forge, /if \(!FORGE_TOOLS\.some\(tool => tool\.id === toolId\)\) toolId = FORGE_TOOLS\[0\]\.id;/, 'the Forge opens on a tool');
});

test('menu entries for the map tools dispatch the way the toolbar does', () => {
    const uiManager = fs.readFileSync(path.join(editorRoot, 'src', 'UIManager.js'), 'utf8');
    const menuSwitch = uiManager.slice(uiManager.indexOf('handleHtmlMenuAction(action) {'), uiManager.indexOf('setupNativeMenu() {'));
    assert.match(menuSwitch, /case 'build-tool':\s*case 'lighting-tool':\s*case 'media-surfaces':\s*this\.handleToolbarAction\(action\);/);
});
