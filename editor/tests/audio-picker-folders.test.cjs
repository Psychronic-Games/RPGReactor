const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const PickerIndex = require(path.join(editorRoot, 'src', 'utils', 'PickerIndex.js'));

class FakeClassList {
    constructor(element) { this.element = element; }
    values() { return new Set(String(this.element.className || '').split(/\s+/).filter(Boolean)); }
    contains(name) { return this.values().has(name); }
    toggle(name, force) {
        const values = this.values();
        const enabled = force === undefined ? !values.has(name) : Boolean(force);
        if (enabled) values.add(name); else values.delete(name);
        this.element.className = [...values].join(' ');
        return enabled;
    }
}

const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());

class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName).toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.style = {};
        this.dataset = {};
        this.listeners = {};
        this.className = '';
        this.classList = new FakeClassList(this);
        this.textContent = '';
        this.value = '';
        this.currentTime = 0;
        this.duration = 0;
        this.disabled = false;
    }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    removeChild(child) {
        this.children = this.children.filter(candidate => candidate !== child);
        child.parentNode = null;
        return child;
    }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    dispatch(type, extra = {}) {
        const event = { target: this, preventDefault() {}, ...extra };
        for (const listener of this.listeners[type] || []) listener(event);
    }
    click() { this.dispatch('click'); }
    focus() { this.focused = true; }
    pause() {}
    play() { return Promise.resolve(); }
    scrollIntoView() {}
    getBoundingClientRect() { return { top: 0 }; }
    setAttribute(name, value) {
        if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value);
        else this[name] = String(value);
    }
    matches(selector) {
        const tag = selector.match(/^[a-z]+/i)?.[0];
        if (tag && this.tagName !== tag.toUpperCase()) return false;
        for (const className of selector.matchAll(/\.([\w-]+)/g)) {
            if (!this.classList.contains(className[1])) return false;
        }
        for (const attribute of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
            const name = attribute[1];
            const actual = name.startsWith('data-') ? this.dataset[dataKey(name)] : this[name];
            if (actual === undefined) return false;
            if (attribute[2] !== undefined && String(actual) !== attribute[2]) return false;
        }
        return true;
    }
    querySelectorAll(selector) {
        return this.children.flatMap(child => [
            ...(child.matches(selector) ? [child] : []),
            ...child.querySelectorAll(selector)
        ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    get innerHTML() { return this._innerHTML || ''; }
    set innerHTML(value) {
        this._innerHTML = String(value);
        if (value === '') {
            this.children.forEach(child => { child.parentNode = null; });
            this.children = [];
        }
    }
}

class FakeIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

function openPicker(files, selected = '', options = {}) {
    const body = new FakeElement('body');
    let audioElement = null;
    let audioContextCount = 0;
    class FakeAudioContext {
        constructor() { audioContextCount += 1; this.destination = {}; }
        createMediaElementSource() { return { connect() {} }; }
        createGain() { return { connect() {}, gain: { value: 0 } }; }
        createStereoPanner() { return { connect() {}, pan: { value: 0 } }; }
        close() {}
    }
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        document: { body, createElement: tag => {
            const element = new FakeElement(tag);
            if (String(tag).toLowerCase() === 'audio') audioElement = element;
            return element;
        } },
        IntersectionObserver: FakeIntersectionObserver,
        AudioContext: FakeAudioContext,
        reactor: options.htmlAudioOnly ? { audioPlayer: {
            audioPlayer: { htmlAudioOnly: true },
            getAudioSectionKey: name => String(name || '').charAt(0).toUpperCase() || '#',
            compareAudioTrackNames: (a, b) => a.localeCompare(b),
            getCoverArt: async () => null
        } } : undefined,
        requestAnimationFrame: () => 0,
        CSS: { escape: value => String(value) },
        RRAssetFiles: { toUrl: filePath => `url:${filePath}` },
        RRAudioCoverArt: {
            placeholderFor: () => 'placeholder',
            extractFromFile: async () => options.coverUrl || null,
            forFile: async () => options.coverUrl || null
        },
        RRAudioLoopTags: {
            loopPointsFromFile: async () => options.loopPoints || null
        },
        setTimeout
    };
    sandbox.window = sandbox;
    vm.runInNewContext(
        fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'PickerIndex.js'), 'utf8'),
        sandbox
    );
    vm.runInNewContext(
        `${fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'AudioPickerModal.js'), 'utf8')}`,
        sandbox
    );
    sandbox.RRAudioPickerModal.open({
        files,
        selected,
        levels: options.levels || null,
        previewLevels: { volume: 90, pitch: 100, pan: 0 },
        loopDefault: !!options.loopDefault,
        onOk() {}
    });
    const overlay = body.children[0];
    const list = overlay.querySelectorAll('.audio-scroll')
        .find(element => element.querySelector('.audio-track-item'));
    return { audioContextCount: () => audioContextCount, audioElement, body, list, overlay, sandbox };
}

test('the shared picker follows embedded loop points and can fall back to HTML audio', async () => {
    const files = [{ name: 'Looped', absolutePath: '/audio/Looped.ogg' }];
    const { audioContextCount, audioElement, list, overlay } = openPicker(files, 'Looped', {
        htmlAudioOnly: true,
        loopDefault: true,
        loopPoints: { start: 1, end: 3 },
        coverUrl: 'data:image/png;base64,cover'
    });
    list.querySelectorAll('.audio-track-item')
        .find(row => row.dataset.fileName === 'Looped').click();
    await new Promise(resolve => setTimeout(resolve, 0));

    const art = list.querySelectorAll('.track-art').find(image => image.dataset.artPath);
    assert.equal(art.src, 'data:image/png;base64,cover', 'shared picker rows use the common cover resolver');
    assert.equal(
        overlay.querySelectorAll('.track-art').filter(image => image.dataset.artPath)
            .every(image => image.src === 'data:image/png;base64,cover'),
        true,
        'the selected header and track row use the same embedded art'
    );

    assert.equal(audioElement.loop, false, 'tagged loops are wrapped manually, not end-to-start');
    assert.equal(audioContextCount(), 0, 'the main player Wine fallback also governs shared pickers');
    assert.equal(audioElement.volume, 0.9, 'HTML audio still applies preview volume');
    audioElement.duration = 10;
    audioElement.currentTime = 3.25;
    audioElement.dispatch('timeupdate');
    assert.equal(audioElement.currentTime, 1.25);

    audioElement.currentTime = 7.25;
    audioElement.dispatch('timeupdate');
    assert.equal(audioElement.currentTime, 1.25, 'multi-loop overshoot wraps with modulo');

    audioElement.currentTime = 5;
    audioElement.dispatch('seeked');
    audioElement.dispatch('timeupdate');
    assert.equal(audioElement.currentTime, 5, 'seeking past the loop end auditions the tail');
    audioElement.onended();
    assert.equal(audioElement.currentTime, 1);
});

test('a flat audio folder keeps letter sections and full row labels', () => {
    const { list } = openPicker([
        { name: 'Alpha', absolutePath: '/audio/Alpha.ogg' },
        { name: 'Bravo', absolutePath: '/audio/Bravo.ogg' }
    ]);
    assert.equal(list.querySelectorAll('.audio-folder-section').length, 0);
    assert.deepEqual(list.querySelectorAll('.letter-section').map(section => section.textContent), ['A', 'B']);
    assert.deepEqual(list.querySelectorAll('.audio-track-item').slice(1)
        .map(row => row.querySelector('.track-label').textContent), ['Alpha', 'Bravo']);
});

test('audio folders are recursive, counted, collapsible, and retain full stored names', async () => {
    const files = [
        { name: 'Root', absolutePath: '/audio/Root.ogg' },
        { name: 'custom/Loose', absolutePath: '/audio/custom/Loose.ogg' },
        { name: 'custom/Sanctuary/chime', absolutePath: '/audio/custom/Sanctuary/chime.ogg' },
        { name: 'custom/EVFX Shoot/laser', absolutePath: '/audio/custom/EVFX Shoot/laser.ogg' }
    ];
    const { audioElement, list } = openPicker(files, 'custom/Sanctuary/chime');

    let headers = list.querySelectorAll('.audio-folder-section');
    assert.deepEqual(headers.map(header => header.textContent), [
        '▾ custom (3)', '▸ EVFX Shoot (1)', '▾ Sanctuary (1)'
    ]);
    const selected = list.querySelectorAll('.audio-track-item')
        .find(row => row.dataset.fileName === 'custom/Sanctuary/chime');
    assert.equal(selected.querySelector('.track-label').textContent, 'chime');
    assert.equal(headers[0].role, 'button');
    assert.equal(headers[0]['aria-expanded'], 'true');

    selected.click();
    await Promise.resolve();
    assert.equal(audioElement.src, 'url:/audio/custom/Sanctuary/chime.ogg',
        'folder tracks still resolve against the complete file array');

    headers[0].dispatch('keydown', { key: 'ArrowLeft' });
    headers = list.querySelectorAll('.audio-folder-section');
    assert.deepEqual(headers.map(header => header.textContent), ['▸ custom (3)']);
    headers[0].dispatch('keydown', { key: 'Enter' });
    assert.equal(list.querySelectorAll('.audio-folder-section').length, 3);
});

test('search-selected files keep every ancestor open and folder controls use the keyboard', () => {
    const { sandbox } = openPicker([], '');
    const browser = sandbox.RRPickerIndex.createBrowser({
        files: ['Root', 'custom/Loose', 'custom/Sanctuary/chime'],
        folders: true,
        selectedName: '',
        onSelect() {}
    });

    let headers = browser.list.querySelectorAll('.folder-section');
    assert.equal(headers.length, 1);
    assert.equal(headers[0].role, 'button');
    assert.equal(headers[0]['aria-expanded'], 'false');
    headers[0].dispatch('keydown', { key: 'ArrowRight' });
    headers = browser.list.querySelectorAll('.folder-section');
    assert.equal(headers.length, 2);
    assert.equal(headers[0].focused, true);

    browser.searchInput.value = 'chime';
    browser.searchInput.dispatch('input');
    const result = browser.list.querySelectorAll('.rr-picker-file-item')
        .find(row => row.dataset.fileName === 'custom/Sanctuary/chime');
    result.click();
    browser.searchInput.value = '';
    browser.searchInput.dispatch('input');

    headers = browser.list.querySelectorAll('.folder-section');
    assert.deepEqual(headers.map(header => header.textContent), [
        '▾ custom (2)', '▾ Sanctuary (1)'
    ]);
    assert.ok(browser.list.querySelectorAll('.rr-picker-file-item')
        .some(row => row.dataset.fileName === 'custom/Sanctuary/chime'));

    headers[0].dispatch('keydown', { key: 'Enter' });
    headers = browser.list.querySelectorAll('.folder-section');
    assert.deepEqual(headers.map(header => header.textContent), ['▸ custom (2)']);
    headers[0].dispatch('keydown', { key: 'Enter' });
    assert.equal(browser.list.querySelectorAll('.folder-section').length, 2,
        'a collapsed selected folder can be reopened normally');
});

test('PickerIndex loads before the Audio Picker that consumes it', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.ok(html.indexOf('src/utils/PickerIndex.js')
        < html.indexOf('src/utils/AudioPickerModal.js'));
});

test('leading items can represent the selected blank value without hiding empty text', () => {
    const { sandbox } = openPicker([], '');
    let cleared = 0;
    const browser = sandbox.RRPickerIndex.createBrowser({
        files: [],
        selectedName: 'missing',
        leadingItem: { label: '(None)', onClick: () => { cleared += 1; } },
        emptyText: 'No files found'
    });
    const leading = browser.list.querySelector('.rr-picker-leading');
    assert.equal(leading['aria-selected'], 'false');
    leading.click();
    assert.equal(leading['aria-selected'], 'true');
    assert.equal(cleared, 1);
    assert.ok(browser.list.children.some(child => child.textContent === 'No files found'));
});
