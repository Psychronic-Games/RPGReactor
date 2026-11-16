const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());

class FakeClassList {
    constructor(element) { this.element = element; }
    values() { return new Set(String(this.element.className || '').split(/\s+/).filter(Boolean)); }
    contains(name) { return this.values().has(name); }
    add(name) { this.toggle(name, true); }
    remove(name) { this.toggle(name, false); }
    toggle(name, force) {
        const values = this.values();
        const enabled = force === undefined ? !values.has(name) : Boolean(force);
        if (enabled) values.add(name); else values.delete(name);
        this.element.className = [...values].join(' ');
        return enabled;
    }
}

class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName).toUpperCase();
        this.children = [];
        this.style = {};
        this.dataset = {};
        this.listeners = {};
        this.className = '';
        this.classList = new FakeClassList(this);
        this.textContent = '';
        this.scrollTop = 0;
    }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    removeEventListener(type, listener) {
        this.listeners[type] = (this.listeners[type] || []).filter(candidate => candidate !== listener);
    }
    dispatch(type, extra = {}) {
        const event = { target: this, preventDefault() {}, ...extra };
        for (const listener of this.listeners[type] || []) listener(event);
    }
    click() { this.dispatch('click'); }
    focus() { this.focused = true; }
    scrollIntoView() { this.scrolledTo = true; }
    getBoundingClientRect() { return { top: 0 }; }
    getClientRects() { return [{}]; }
    setAttribute(name, value) {
        if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value);
        else this[name] = String(value);
    }
    matches(selector) {
        for (const className of selector.matchAll(/\.([\w-]+)/g)) {
            if (!this.classList.contains(className[1])) return false;
        }
        for (const attribute of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
            const actual = attribute[1].startsWith('data-') ? this.dataset[dataKey(attribute[1])] : this[attribute[1]];
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
    get innerHTML() { return ''; }
    set innerHTML(value) { if (value === '') this.children = []; }
}

function loadPlayer(names, options = {}) {
    const elements = {
        'audio-track-list': new FakeElement('div'),
        'audio-alphabet-tabs': new FakeElement('div')
    };
    const selected = [];
    const sandbox = {
        console, Intl, Symbol,
        document: {
            createElement: tag => new FakeElement(tag),
            getElementById: id => elements[id] || null
        },
        IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
        require: name => name === 'fs' ? { existsSync: () => true } : require(name),
        RRAssetFiles: {
            AUDIO_EXTENSIONS: ['.ogg'],
            listUnique: () => names.map(name => ({ relativePath: name, absolutePath: `/p/audio/bgm/${name}.ogg` }))
        }
    };
    sandbox.window = sandbox;
    vm.runInNewContext(fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'PickerIndex.js'), 'utf8'), sandbox);
    const AudioPlayer = vm.runInNewContext(
        `${fs.readFileSync(path.join(editorRoot, 'src', 'AudioPlayer.js'), 'utf8')}\nAudioPlayer;`, sandbox);
    const player = Object.create(AudioPlayer.prototype);
    const loaded = options.loaded ? { name: options.loaded, path: `/p/audio/bgm/${options.loaded}.ogg` } : null;
    player.currentProject = { path: '/p' };
    player.audioPlayer = { tracks: {}, currentType: 'bgm', channels: { bgm: { currentTrack: loaded } } };
    player.getCoverArt = async () => null;
    player.selectAudioTrack = (name, type) => selected.push([name, type]);
    player.loadAudioTracks('bgm');
    const list = elements['audio-track-list'];
    const rail = elements['audio-alphabet-tabs'];
    const rows = () => list.children.map(child => child.classList.contains('audio-folder-section')
        ? `[${child.textContent}]`
        : child.classList.contains('letter-section') ? `#${child.textContent}`
        : `${child.querySelector('.track-label').textContent}${child.style.paddingLeft ? ` @${child.style.paddingLeft}` : ''}`);
    const header = folder => list.querySelectorAll('.audio-folder-section').find(item => item.dataset.folder === folder);
    return { player, list, rail, rows, header, selected };
}

test('subfolders render as collapsed sections above the folder\'s own lettered tracks', () => {
    const { rows, rail } = loadPlayer(['Theme', 'Battle/Boss', 'Battle/Field', 'Battle/Old/Retro', 'Ambient', 'Town/Inn']);
    assert.deepEqual(rows(), ['[▸ Battle (3)]', '[▸ Town (1)]', '#A', 'Ambient', '#T', 'Theme']);
    assert.deepEqual(rail.children.map(tab => [tab.textContent, tab.title || '']),
        [['B', 'Battle'], ['T', 'Town'], ['A', ''], ['T', '']]);
});

test('a flat folder keeps the old letter layout', () => {
    const { rows, rail } = loadPlayer(['Theme', 'Ambient', 'Battle1']);
    assert.deepEqual(rows(), ['#A', 'Ambient', '#B', 'Battle1', '#T', 'Theme']);
    assert.deepEqual(rail.children.map(tab => tab.textContent), ['A', 'B', 'T']);
});

test('opening a folder shows its subfolders and short-named, indented tracks that play by full name', () => {
    const { rows, header, list, selected } = loadPlayer(['Theme', 'Battle/Field', 'Battle/Boss', 'Battle/Old/Retro']);
    list.scrollTop = 40;
    header('Battle').click();
    assert.deepEqual(rows(), ['[▾ Battle (3)]', '[▸ Old (1)]', 'Boss @26px', 'Field @26px', '#T', 'Theme']);
    assert.equal(list.scrollTop, 40, 'toggling a folder keeps the list where it was');
    assert.equal(header('Battle').focused, true, 'focus stays on the toggled folder');
    assert.equal(header('Battle')['aria-expanded'], 'true');

    header('Battle/Old').dispatch('keydown', { key: 'ArrowRight' });
    assert.deepEqual(rows(), ['[▾ Battle (3)]', '[▾ Old (1)]', 'Retro @40px', 'Boss @26px', 'Field @26px', '#T', 'Theme']);
    const boss = list.querySelectorAll('.audio-track-item').find(item => item.dataset.track === 'Battle/Boss');
    assert.equal(boss.querySelector('.track-label').title, 'Battle/Boss');
    boss.click();
    assert.deepEqual(selected, [['Battle/Boss', 'bgm']]);

    header('Battle').dispatch('keydown', { key: 'ArrowLeft' });
    assert.deepEqual(rows(), ['[▸ Battle (3)]', '#T', 'Theme']);
});

test('the loaded track\'s folders start open, and open folders survive a reload of the list', () => {
    const { player, rows } = loadPlayer(['Theme', 'Battle/Field', 'Battle/Old/Retro', 'Town/Inn'], { loaded: 'Battle/Old/Retro' });
    assert.deepEqual(rows(), ['[▾ Battle (2)]', '[▾ Old (1)]', 'Retro @40px', 'Field @26px', '[▸ Town (1)]', '#T', 'Theme']);
    const playing = player.audioPlayer.channels.bgm;
    assert.equal(playing.currentTrack.name, 'Battle/Old/Retro');
    player.loadAudioTracks('bgm');
    assert.deepEqual(rows().slice(0, 3), ['[▾ Battle (2)]', '[▾ Old (1)]', 'Retro @40px']);
});

test('a rail folder button opens its folder and scrolls to it', () => {
    const { rail, rows, header } = loadPlayer(['Theme', 'Battle/Boss']);
    rail.children.find(tab => tab.dataset.folder === 'Battle').click();
    assert.deepEqual(rows(), ['[▾ Battle (1)]', 'Boss @26px', '#T', 'Theme']);
    assert.equal(header('Battle').scrolledTo, true);
});
