/**
 * A DOM small enough to run one editor widget in, and no smaller.
 *
 * The editor's UI code is plain DOM against globals - there is no framework to
 * mount and no jsdom in the dependency list. A widget can still be *run* rather
 * than only grepped, which is the difference between "the call is written" and
 * "the call produces the element". This stub covers the subset the shim uses:
 * element creation, parent/child wiring, a class/tag selector, listeners that
 * can be fired by hand, and the window/document/MutationObserver globals a
 * top-level IIFE reads on load.
 *
 * It is deliberately not a DOM implementation. Anything it does not cover
 * should be added when a test needs it rather than guessed at in advance.
 */
'use strict';

function createStyle() {
    const style = {};
    let text = '';
    Object.defineProperty(style, 'cssText', {
        get: () => text,
        set: value => { text = String(value); },
        enumerable: true
    });
    return style;
}

/** `.class`, `tag`, or `tag.class` - the selectors the editor's widgets use. */
function matches(element, selector) {
    return String(selector).split(',').map(part => part.trim()).some(part => {
        const [tag, ...classes] = part.split('.');
        if (tag && element.tagName !== tag.toUpperCase()) return false;
        const own = String(element.className || '').split(/\s+/);
        return classes.every(name => own.includes(name));
    });
}

function createElement(tagName) {
    const element = {
        tagName: String(tagName).toUpperCase(),
        className: '',
        style: createStyle(),
        dataset: {},
        childNodes: [],
        parentNode: null,
        listeners: {},
        disabled: false,

        get children() {
            return this.childNodes.filter(node => node.tagName);
        },
        get firstChild() {
            return this.childNodes[0] || null;
        },
        get textContent() {
            return this.childNodes.map(node => node.nodeValue !== undefined
                ? node.nodeValue
                : (node.textContent || '')).join('');
        },
        set textContent(value) {
            this.childNodes = [];
            if (value !== '' && value != null) this.appendChild(createTextNode(value));
        },

        appendChild(child) {
            if (child.parentNode) child.parentNode.removeChild(child);
            child.parentNode = this;
            this.childNodes.push(child);
            return child;
        },
        insertBefore(child, reference) {
            const at = this.childNodes.indexOf(reference);
            if (child.parentNode) child.parentNode.removeChild(child);
            child.parentNode = this;
            this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, child);
            return child;
        },
        removeChild(child) {
            const at = this.childNodes.indexOf(child);
            if (at >= 0) this.childNodes.splice(at, 1);
            child.parentNode = null;
            return child;
        },
        remove() {
            if (this.parentNode) this.parentNode.removeChild(this);
        },
        contains(other) {
            if (other === this) return true;
            return this.children.some(child => child.contains(other));
        },

        querySelectorAll(selector) {
            const found = [];
            for (const child of this.children) {
                if (matches(child, selector)) found.push(child);
                found.push(...child.querySelectorAll(selector));
            }
            return found;
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },

        addEventListener(type, handler) {
            (this.listeners[type] = this.listeners[type] || []).push(handler);
        },
        removeEventListener(type, handler) {
            this.listeners[type] = (this.listeners[type] || []).filter(fn => fn !== handler);
        },
        /** Fire one element's handlers directly; no bubbling, none is needed. */
        fire(type, event = {}) {
            for (const handler of (this.listeners[type] || []).slice()) {
                handler(Object.assign({ type, target: this, stopPropagation() {} }, event));
            }
        },
        dispatchEvent(event) {
            this.fire(event.type, event);
            return true;
        },
        getBoundingClientRect() {
            return { left: 0, top: 100, right: 200, bottom: 120, width: 200, height: 20 };
        }
    };
    return element;
}

function createTextNode(value) {
    let text = String(value);
    return {
        get nodeValue() { return text; },
        set nodeValue(next) { text = String(next); },
        get textContent() { return text; },
        parentNode: null,
        contains() { return false; }
    };
}

/** A <select> with <option> children, wired the way the shim reads one. */
function createSelect(entries, selectedValue) {
    const select = createElement('select');
    for (const entry of entries) {
        const option = createElement('option');
        option.value = String(entry.value);
        option.textContent = String(entry.text);
        select.appendChild(option);
    }
    Object.defineProperty(select, 'options', { get() { return this.children; } });
    Object.defineProperty(select, 'selectedIndex', {
        get() { return this.children.findIndex(option => option.value === this.value); }
    });
    select.value = String(selectedValue);
    return select;
}

/**
 * A context to run a top-level browser IIFE in. `timers: false` runs
 * setTimeout callbacks immediately, which keeps a test synchronous.
 */
function createContext(extra = {}) {
    const document = createElement('document');
    document.body = createElement('body');
    document.documentElement = createElement('html');
    document.readyState = 'complete';
    document.createElement = createElement;
    document.createTextNode = createTextNode;
    document.appendChild(document.documentElement);
    document.documentElement.appendChild(document.body);
    document.querySelectorAll = selector => document.body.querySelectorAll(selector);
    document.querySelector = selector => document.body.querySelector(selector);

    const context = {
        console,
        document,
        innerHeight: 800,
        innerWidth: 1200,
        getComputedStyle: () => ({ flex: '0 1 auto' }),
        addEventListener() {},
        removeEventListener() {},
        setTimeout: fn => { fn(); return 0; },
        clearTimeout() {},
        MutationObserver: class { observe() {} disconnect() {} },
        // SelectThemingShim falls back to HTMLSelectElement.prototype for the
        // native value/selectedIndex accessors when the element's own prototype
        // carries none. These elements are plain objects, so neither lookup finds
        // a descriptor and the shim skips its accessor wrapping; the stub only has
        // to exist so that lookup does not throw.
        HTMLSelectElement: class {},
        Event: class { constructor(type, options) { Object.assign(this, { type }, options); } },
        WeakSet
    };
    Object.assign(context, extra);
    context.window = context;
    context.globalThis = context;
    return context;
}

module.exports = { createElement, createTextNode, createSelect, createContext, matches };
