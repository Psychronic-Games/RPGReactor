'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function player({ display = 'none' } = {}) {
    const events = new Map(), calls = [];
    const close = { addEventListener() {} };
    const overlay = { style: { display }, querySelector: selector => (selector === '.modal-close' ? close : null), _rrModalKeys: { leave: () => calls.push('leave') } };
    const document = { getElementById: id => (id === 'audio-player-modal' ? overlay : null), querySelector: () => null };
    const window = { addEventListener: (type, listener) => events.set(type, listener) };
    const floating = { install: () => calls.push('install'), open: (node, options) => calls.push('open:' + options.shownBefore), hidePopout: () => calls.push('hide') };
    const AudioPlayer = vm.runInNewContext(read('src/AudioPlayer.js') + '\nAudioPlayer;', { window, document, RRAudioPlayerWindow: floating, console });
    const audio = Object.create(AudioPlayer.prototype);
    Object.assign(audio, { uiInitialized: true, currentProject: null, audioPlayer: { currentType: 'bgm' },
        initializeAudioPlayer() {}, getChannel: () => ({}), getCurrentChannel: () => ({}), updateTrackHeader() {}, switchAudioType() {} });
    return { audio, overlay, calls, events };
}

test('the Audio Player opens in the shared window, comes to the front when asked again, and its close hides that window', () => {
    const f = player();
    f.audio.showAudioPlayer();
    assert.equal(f.overlay.style.display, 'flex');
    f.audio.showAudioPlayer();
    assert.deepEqual(f.calls.filter(call => call !== 'leave'), ['install', 'open:false', 'install', 'open:true']);
    f.calls.length = 0;
    f.audio.hideAudioPlayer();
    assert.equal(f.overlay.style.display, 'none');
    assert.deepEqual(f.calls, ['leave', 'hide']);
});

test('the Audio Player is a window of the same kind as the Forge and the Database', () => {
    const api = require('../src/AudioPlayerWindow.js');
    assert.equal(typeof api.toggleFit, 'function');
    assert.equal(typeof api.setPinned, 'function');
    assert.ok(api.MIN_WIDTH <= 520 && api.MIN_HEIGHT <= 560, 'it can be made small enough to sit beside the map');
    const html = read('index.html');
    assert.match(html, /class="modal-content rr-audio-window"/);
    assert.doesNotMatch(html, /audio-player-modal'\)\.style\.display='none'/, 'its × goes through the player, which hides the window too');
    assert.ok(html.indexOf('src/AudioPlayerWindow.js') > html.indexOf('src/utils/DetachedWindow.js'));
    assert.ok(fs.existsSync(path.join(root, 'audio-player-panel.html')));
    assert.match(read('build-scripts/dist-editor-worker.js'), /'audio-player-panel\.html'/);
    const css = read('css/styles.css');
    for (const name of ['rr-audio-floating', 'rr-audio-popped', 'rr-audio-grip']) assert.ok(css.includes(name), name);
});

test('an open Audio Player leaves the map its shortcuts until it is clicked into', () => {
    let owns = false;
    const overlay = { id: 'audio-player-modal', style: { display: 'flex' }, getClientRects: () => [{}] };
    const document = { getElementById: id => (id === 'audio-player-modal' ? overlay : null), querySelectorAll: () => [overlay] };
    overlay.ownerDocument = document;
    const UI = vm.runInNewContext(read('src/UIManager.js') + '\nUIManager;', { document, RRAudioPlayerWindow: { ownsKeys: () => owns }, console });
    const ui = Object.create(UI.prototype);
    assert.equal(ui.isEditorModalOpenForGlobalShortcuts(), false);
    owns = true;
    assert.equal(ui.isEditorModalOpenForGlobalShortcuts(), true);
});

function channels() {
    const make = playing => ({ playing, currentTrack: playing === null ? null : { name: 'Track' },
        audio: { paused: !playing, ended: false, pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); } } });
    const set = { bgm: make(true), bgs: make(true), me: make(false), se: make(null) };
    const { audio } = player();
    const note = { hidden: true, textContent: '' };
    Object.assign(audio, { audioPlayer: { currentType: 'bgm', channels: set, audioContext: null },
        getChannel: type => set[type], getCurrentChannel: () => set[audio.audioPlayer.currentType], updateAudioTime() {} });
    audio.updatePreviewHoldNote = function () { note.hidden = !(this._previewHeld && this._previewHeld.size); note.textContent = note.hidden ? '' : this._previewLabel; };
    return { audio, set, note };
}

test('what the Audio Player has playing waits for a track listened to elsewhere and comes back after it', () => {
    const { audio, set, note } = channels();
    audio.holdForPreview('[BGM] Town');
    assert.deepEqual([set.bgm.audio.paused, set.bgs.audio.paused, set.bgm.playing], [true, true, false]);
    assert.deepEqual([note.hidden, note.textContent], [false, '[BGM] Town']);
    audio.holdForPreview('[BGM] Field');
    assert.equal(note.textContent, '[BGM] Field', 'a second track in the picker keeps the wait and renames it');
    audio.releasePreview();
    assert.deepEqual([set.bgm.audio.paused, set.bgs.audio.paused, set.bgm.playing, set.me.playing], [false, false, true, false],
        'what was playing plays again; what was not stays silent');
    assert.equal(note.hidden, true);
});

test('a channel the owner stops while it waits is not started again for them', () => {
    const { audio, set } = channels();
    audio.holdForPreview('[BGM] Town');
    audio.stopAudio();
    audio.releasePreview();
    assert.deepEqual([set.bgm.playing, set.bgs.playing], [false, true]);
});

test('nothing playing: nothing waits and nothing starts', () => {
    const { audio, set, note } = channels();
    set.bgm.playing = false; set.bgs.playing = false;
    audio.holdForPreview('[BGM] Town');
    assert.equal(note.hidden, true);
    audio.releasePreview();
    assert.deepEqual([set.bgm.playing, set.bgs.playing], [false, false]);
});
