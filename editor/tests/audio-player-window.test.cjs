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
