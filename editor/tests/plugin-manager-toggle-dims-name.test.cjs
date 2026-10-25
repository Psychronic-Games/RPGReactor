'use strict';
// Turning a plugin off by its checkbox dims its name at once, as the list draws it when reopened.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

function fakeElement(tag) {
    const el = {
        tagName: String(tag).toUpperCase(), style: {}, dataset: {}, children: [], listeners: {},
        addEventListener(type, fn) { (el.listeners[type] = el.listeners[type] || []).push(fn); },
        appendChild(child) { el.children.push(child); return child; },
        fire(type, event = {}) { for (const fn of el.listeners[type] || []) fn({ stopPropagation() {}, preventDefault() {}, ...event }); }
    };
    return el;
}

test('the checkbox dims and restores the name of an unselected plugin row', () => {
    const saved = global.document;
    global.document = { createElement: fakeElement };
    try {
        const PluginManager = require(path.join(__dirname, '..', 'src', 'PluginManager.js'));
        const manager = new PluginManager({});
        const plugin = { name: 'Probe', status: true, parameters: {} };
        manager.plugins = [plugin];
        const item = manager.createPluginListItem(plugin, 0);
        const checkbox = item.children.find(child => child.tagName === 'INPUT');
        const name = item.children.find(child => child.tagName === 'SPAN');
        assert.match(name.style.cssText, /var\(--color-text-strong\)/);

        checkbox.checked = false;
        checkbox.fire('click');
        assert.equal(plugin.status, false);
        assert.equal(name.style.color, 'var(--color-text-muted)');

        checkbox.checked = true;
        checkbox.fire('click');
        assert.equal(plugin.status, true);
        assert.equal(name.style.color, 'var(--color-text-strong)');
    } finally {
        global.document = saved;
    }
});

test('a selected row keeps its accent name color when toggled', () => {
    const saved = global.document;
    global.document = { createElement: fakeElement };
    try {
        const PluginManager = require(path.join(__dirname, '..', 'src', 'PluginManager.js'));
        const manager = new PluginManager({});
        const plugin = { name: 'Probe', status: true, parameters: {} };
        manager.plugins = [plugin];
        manager.selectedPluginIndices = new Set([0]);
        const item = manager.createPluginListItem(plugin, 0);
        const checkbox = item.children.find(child => child.tagName === 'INPUT');
        const name = item.children.find(child => child.tagName === 'SPAN');
        checkbox.checked = false;
        checkbox.fire('click');
        assert.equal(plugin.status, false);
        assert.equal(name.style.color, undefined);
        assert.match(name.style.cssText, /var\(--color-accent-on\)/);
    } finally {
        global.document = saved;
    }
});
