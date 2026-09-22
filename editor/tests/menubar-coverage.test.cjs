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

test('the Database menu lists every database category, in the sidebar order', () => {
    const ui = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    const block = ui.match(/const categories = \[\s*\{ name: 'Actors'[\s\S]*?\];/);
    assert.ok(block, 'DatabaseEditorUI names its categories');
    const sidebar = Array.from(block[0].matchAll(/type: '([^']+)'/g), m => m[1]);
    const menu = attributeValues(submenu('database'), 'data-db');
    assert.deepEqual(menu, sidebar);
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
    assert.ok(toolbarActions.includes('build-tool') && toolbarActions.includes('lighting-tool') && toolbarActions.includes('media-surfaces'));
});

test('the Forge menu lists every registered Forge tool', () => {
    const forge = fs.readFileSync(path.join(editorRoot, 'src', 'forge', 'ForgeManager.js'), 'utf8');
    const tools = Array.from(forge.matchAll(/^\s+id: '([a-z-]+)',/gm), m => m[1]);
    assert.ok(tools.length >= 5, 'FORGE_TOOLS is read');
    const menu = attributeValues(submenu('forge'), 'data-action');
    assert.deepEqual(tools.filter(id => !menu.includes(`forge-${id}`)), []);
    const uiManager = fs.readFileSync(path.join(editorRoot, 'src', 'UIManager.js'), 'utf8');
    for (const id of tools) assert.match(uiManager, new RegExp(`case 'forge-${id}':[\\s\\S]{0,120}openForgeTool\\('${id}'\\)`));
});

test('menu entries for the map tools dispatch the way the toolbar does', () => {
    const uiManager = fs.readFileSync(path.join(editorRoot, 'src', 'UIManager.js'), 'utf8');
    const menuSwitch = uiManager.slice(uiManager.indexOf('handleHtmlMenuAction(action) {'), uiManager.indexOf('setupNativeMenu() {'));
    assert.match(menuSwitch, /case 'build-tool':\s*case 'lighting-tool':\s*case 'media-surfaces':\s*this\.handleToolbarAction\(action\);/);
});
