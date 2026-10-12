/**
 * A document small enough to run a card that draws itself with `innerHTML`:
 * markup is read into elements, a selector finds them, and an event sent to
 * one travels the way a browser sends it (the window and the document
 * first, then down to the element and back up), with a key's or a click's
 * own action at the end. It covers what Battle Setup's card uses and is not
 * a DOM beyond that: add to it when a test needs more.
 *
 *   const { createDocument } = require('./helpers/card-dom.cjs');
 *   const { document, window } = createDocument();
 */
'use strict';

const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link']);
const decode = text => String(text).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&');
const camel = name => name.replace(/-([a-z])/g, (all, letter) => letter.toUpperCase());
const dashed = name => name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());

/** One simple selector (`tag.class#id[attr="v"]`) against an element. */
function matchesSimple(element, simple) {
    const tag = (/^[a-zA-Z][\w-]*/.exec(simple) || [''])[0];
    if (tag && element.tagName !== tag.toUpperCase()) return false;
    for (const [, id] of simple.matchAll(/#([\w-]+)/g)) if (element.id !== id) return false;
    for (const [, name] of simple.replace(/\[[^\]]*\]/g, '').matchAll(/\.([\w-]+)/g)) if (!element.classList.contains(name)) return false;
    for (const [, key, , value] of simple.matchAll(/\[([\w-]+)(=(?:"([^"]*)"|[^\]]*))?\]/g)) {
        if (!element.hasAttribute(key)) return false;
        if (value !== undefined && element.getAttribute(key) !== value) return false;
    }
    return true;
}

/** A selector with descendant (` `) and child (`>`) steps, and commas. */
function matches(element, selector) {
    return String(selector).split(',').some(part => {
        const steps = part.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/);
        const fits = (node, at) => {
            if (!node || !node.tagName || !matchesSimple(node, steps[at])) return false;
            if (at === 0) return true;
            if (steps[at - 1] === '>') return fits(node.parentNode, at - 2);
            for (let up = node.parentNode; up && up.tagName; up = up.parentNode) if (fits(up, at - 1)) return true;
            return false;
        };
        return fits(element, steps.length - 1);
    });
}

function createDocument() {
    const document = { nodeType: 9, tagName: '', parentNode: null, childNodes: [], activeElement: null, listeners: [] };
    const window = { listeners: [] };
    const listen = holder => (type, handler, capture) => { holder.listeners.push({ type, handler, capture: !!capture }); };
    const unlisten = holder => (type, handler) => { holder.listeners = holder.listeners.filter(each => !(each.type === type && each.handler === handler)); };

    class Text {
        constructor(value) { this.nodeValue = String(value); this.parentNode = null; }
        get textContent() { return this.nodeValue; }
    }

    class Element {
        constructor(tag) {
            this.tagName = String(tag).toUpperCase();
            this.attributes = new Map();
            this.childNodes = [];
            this.parentNode = null;
            this.listeners = [];
            this.style = {};
            const self = this;
            this.dataset = new Proxy({}, {
                get: (target, key) => (typeof key === 'string' && self.attributes.has('data-' + dashed(key)) ? self.attributes.get('data-' + dashed(key)) : undefined),
                set: (target, key, value) => { self.attributes.set('data-' + dashed(key), String(value)); return true; },
                has: (target, key) => typeof key === 'string' && self.attributes.has('data-' + dashed(key))
            });
            this.classList = {
                contains: name => self.className.split(/\s+/).includes(name),
                add: (...names) => { for (const name of names) if (!self.classList.contains(name)) self.className = (self.className + ' ' + name).trim(); },
                remove: (...names) => { self.className = self.className.split(/\s+/).filter(name => name && !names.includes(name)).join(' '); },
                toggle: (name, force) => { const on = force === undefined ? !self.classList.contains(name) : !!force; if (on) self.classList.add(name); else self.classList.remove(name); return on; }
            };
        }
        // Attributes, and the properties that mirror them.
        getAttribute(key) { return this.attributes.has(key) ? this.attributes.get(key) : null; }
        setAttribute(key, value) { this.attributes.set(key, String(value)); }
        hasAttribute(key) { return this.attributes.has(key); }
        removeAttribute(key) { this.attributes.delete(key); }
        get id() { return this.getAttribute('id') || ''; }
        set id(value) { this.setAttribute('id', value); }
        get className() { return this.getAttribute('class') || ''; }
        set className(value) { this.setAttribute('class', value); }
        get title() { return this.getAttribute('title') || ''; }
        set title(value) { this.setAttribute('title', value); }
        get hidden() { return this.hasAttribute('hidden'); }
        set hidden(on) { if (on) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
        get disabled() { return this.hasAttribute('disabled'); }
        set disabled(on) { if (on) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
        get open() { return this.hasAttribute('open'); }
        set open(on) { if (on) this.setAttribute('open', ''); else this.removeAttribute('open'); }
        get width() { return Number(this.getAttribute('width')) || 0; }
        set width(value) { this.setAttribute('width', value); }
        get height() { return Number(this.getAttribute('height')) || 0; }
        set height(value) { this.setAttribute('height', value); }
        /** A field's value: a list's is its chosen option's. */
        get value() {
            if (this.tagName === 'SELECT') {
                const options = this.querySelectorAll('option'), chosen = options.find(option => option.hasAttribute('selected')) || options[0];
                return chosen ? chosen.value : '';
            }
            if (this.tagName === 'OPTION') return this.hasAttribute('value') ? this.getAttribute('value') : this.textContent;
            return this.getAttribute('value') || '';
        }
        set value(next) {
            if (this.tagName !== 'SELECT') { this.setAttribute('value', next); return; }
            for (const option of this.querySelectorAll('option')) { if (option.value === String(next)) option.setAttribute('selected', ''); else option.removeAttribute('selected'); }
        }
        get selectedOptions() { const options = this.querySelectorAll('option'), chosen = options.find(option => option.hasAttribute('selected')) || options[0]; return chosen ? [chosen] : []; }

        // The tree.
        get children() { return this.childNodes.filter(node => node.tagName); }
        get parentElement() { return this.parentNode && this.parentNode.tagName ? this.parentNode : null; }
        get isConnected() { let top = this; while (top.parentNode) top = top.parentNode; return top === document; }
        appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.childNodes.push(child); return child; }
        removeChild(child) { const at = this.childNodes.indexOf(child); if (at >= 0) this.childNodes.splice(at, 1); child.parentNode = null; if (document.activeElement && !document.activeElement.isConnected) document.activeElement = document.body; return child; }
        remove() { if (this.parentNode) this.parentNode.removeChild(this); }
        contains(other) { for (let node = other; node; node = node.parentNode) if (node === this) return true; return false; }
        closest(selector) { for (let node = this; node && node.tagName; node = node.parentNode) if (matches(node, selector)) return node; return null; }
        matches(selector) { return matches(this, selector); }
        querySelectorAll(selector) {
            const found = [];
            const walk = node => { for (const child of node.children) { if (matches(child, selector)) found.push(child); walk(child); } };
            walk(this);
            return found;
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
        set textContent(value) { for (const child of this.childNodes) child.parentNode = null; this.childNodes = []; if (value !== '' && value != null) this.appendChild(new Text(value)); }
        set innerHTML(markup) {
            for (const child of this.childNodes) child.parentNode = null;
            this.childNodes = [];
            if (document.activeElement && !document.activeElement.isConnected) document.activeElement = document.body;
            let at = this;
            for (const token of String(markup).matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/g)) {
                const [, closing, tag, attributes, text] = token;
                if (text !== undefined) { at.appendChild(new Text(decode(text))); continue; }
                if (closing) { if (at !== this) at = at.parentNode; continue; }
                const made = new Element(tag);
                for (const [, key, , value] of attributes.matchAll(/([^\s=]+)(="([^"]*)")?/g)) made.setAttribute(key, value === undefined ? '' : decode(value));
                at.appendChild(made);
                if (!VOID.has(tag.toLowerCase())) at = made;
            }
        }

        // Events.
        addEventListener(type, handler, capture) { this.listeners.push({ type, handler, capture: !!capture }); }
        removeEventListener(type, handler) { this.listeners = this.listeners.filter(each => !(each.type === type && each.handler === handler)); }
        /** Sends an event the way a browser does; returns it. */
        dispatchEvent(given) {
            const event = Object.assign({ bubbles: true, defaultPrevented: false, stopped: false, halted: false }, given, { target: this });
            event.preventDefault = () => { event.defaultPrevented = true; };
            event.stopPropagation = () => { event.stopped = true; };
            event.stopImmediatePropagation = () => { event.stopped = true; event.halted = true; };
            const path = [];
            for (let node = this; node && node.tagName; node = node.parentNode) path.push(node);
            const connected = this.isConnected;
            const run = (holder, capture) => {
                for (const each of holder.listeners.slice()) {
                    if (event.halted) return;
                    if (each.type === event.type && each.capture === capture) each.handler.call(holder, event);
                }
            };
            const down = (connected ? [window, document] : []).concat(path.slice(1).reverse());
            for (const holder of down) { if (event.stopped) break; run(holder, true); }
            if (!event.stopped) { run(this, true); if (!event.halted) run(this, false); }
            if (event.bubbles) for (const holder of path.slice(1).concat(connected ? [document, window] : [])) { if (event.stopped) break; run(holder, false); }
            return event;
        }
        /** A click, unless the control is disabled; a `<summary>` then opens or shuts its `<details>`. */
        click() {
            if (this.disabled) return null;
            const event = this.dispatchEvent({ type: 'click' });
            if (!event.defaultPrevented && this.tagName === 'SUMMARY' && this.parentNode && this.parentNode.tagName === 'DETAILS') {
                this.parentNode.open = !this.parentNode.open;
                this.parentNode.dispatchEvent({ type: 'toggle', bubbles: false });
            }
            return event;
        }
        /** A key pressed with the keyboard on this element: Enter on a button or a summary, not prevented, clicks it. */
        key(key, more) {
            const event = this.dispatchEvent(Object.assign({ type: 'keydown', key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, more || {}));
            if (!event.defaultPrevented && key === 'Enter' && (this.tagName === 'BUTTON' || this.tagName === 'SUMMARY')) this.click();
            return event;
        }
        /** A value chosen in a list or typed into a field, with the event the control then sends. */
        choose(value, type) { this.value = value; return this.dispatchEvent({ type: type || 'change' }); }
        focus() {
            if (!this.isConnected) return;
            const left = document.activeElement;
            if (left === this) return;
            document.activeElement = this;
            this.dispatchEvent({ type: 'focusin', relatedTarget: left && left !== document.body ? left : null });
        }
        blur() { if (document.activeElement === this) document.activeElement = document.body; }
        scrollIntoView() {}
        setSelectionRange() {}
        getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 }; }
        /** A canvas's picture, as text that says its size and how many drawing calls made it. */
        toDataURL() { return 'data:image/png;base64,' + Buffer.from(`picture ${this.width}x${this.height} drawn ${this.drawn || 0}`).toString('base64'); }
        /** A canvas takes any drawing call, counts them, and keeps each with the numbers it was given (`calls`). */
        getContext() {
            const canvas = this;
            canvas.drawn = canvas.drawn || 0;
            canvas.calls = canvas.calls || [];
            if (canvas.context) return canvas.context;
            const context = canvas.context = new Proxy({}, {
                get: (target, key) => (key in target ? target[key] : key === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) })
                    : (...given) => { canvas.drawn++; canvas.calls.push([key].concat(given.filter(each => typeof each !== 'object'))); return context; }),
                set: (target, key, value) => { target[key] = value; return true; }
            });
            return context;
        }
    }

    document.createElement = tag => new Element(tag);
    document.createTextNode = value => new Text(value);
    document.addEventListener = listen(document);
    document.removeEventListener = unlisten(document);
    window.addEventListener = listen(window);
    window.removeEventListener = unlisten(window);
    document.documentElement = new Element('html');
    document.documentElement.parentNode = document;
    document.childNodes.push(document.documentElement);
    document.body = document.documentElement.appendChild(new Element('body'));
    document.activeElement = document.body;
    document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
    document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
    document.getElementById = id => document.querySelectorAll('[id]').find(element => element.id === id) || null;
    /** An event with no element of its own (`rr-events-changed`): the document's listeners, then the window's. */
    document.dispatchEvent = given => { const event = Object.assign({ target: document }, given); for (const holder of [document, window]) for (const each of holder.listeners.slice()) if (each.type === event.type) each.handler.call(holder, event); return event; };
    window.dispatchEvent = given => { const event = Object.assign({ target: window }, given); for (const each of window.listeners.slice()) if (each.type === event.type) each.handler.call(window, event); return event; };
    return { document, window, Element, matches };
}

module.exports = { createDocument, matches };
