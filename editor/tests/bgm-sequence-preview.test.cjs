/**
 * The sequence preview: the runtime's own WebAudio and AudioManager, run in a
 * scope of their own inside the editor, and the list's Preview / Stop / Skip.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const url = require('node:url');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');
const runtime = file => fs.readFileSync(path.join(repoRoot, 'runtime', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const Preview = require(path.join(editorRoot, 'src', 'utils', 'SequencePreview.js'));

/** A WebAudio whose clock and buffers the test holds, in place of the one that needs a sound card. */
const FAKE_WEBAUDIO = `
function WebAudio(url) {
    this.url = url; this.name = ''; this._stops = []; this._isPlaying = false;
    this._totalTime = 60; this._startTime = 0; this._pitch = 1; this.volume = 1;
    WebAudio.created.push(this);
}
WebAudio.created = [];
WebAudio.now = 1;
WebAudio.initialize = function() { return true; };
WebAudio._currentTime = function() { return WebAudio.now; };
WebAudio.prototype.play = function() { this._isPlaying = true; this._startTime = WebAudio.now; };
WebAudio.prototype.stop = function() { this._isPlaying = false; const stops = this._stops; this._stops = []; stops.forEach(fn => fn()); };
WebAudio.prototype.destroy = function() { this.destroyed = true; this.stop(); };
WebAudio.prototype.fadeIn = function(duration) { this.fadedIn = duration; };
WebAudio.prototype.fadeOut = function(duration) { this.fadedOut = duration; };
WebAudio.prototype.addStopListener = function(fn) { this._stops.push(fn); };
WebAudio.prototype.isPlaying = function() { return this._isPlaying; };
WebAudio.prototype.isError = function() { return false; };
`;

function fakeEngine() {
    const source = FAKE_WEBAUDIO + '\n' + Preview.slice(runtime('reactor_managers.js'), Preview.SECTIONS.audioManager);
    return Preview.buildEngine(source, Preview.createUtils());
}

const timers = () => ({ set: () => 1, clear: () => {} });

const SEQUENCE = {
    enabled: false,
    entries: [
        { type: 'track', name: 'Intro', once: true, fadeIn: 0, volume: 100, pitch: 100, pan: 0 },
        { type: 'palette', duration: 0, fadeIn: 0, fadeOut: 4, single: false, once: false,
          layers: [{ volume: 100, pitch: 100, pan: 0, order: 'sequential', pool: [{ type: 'track', name: 'Bed', volume: 100 }] }] }
    ]
};

test('the preview runs the runtime’s own WebAudio and AudioManager, each sliced whole', () => {
    const web = Preview.slice(runtime('reactor_core.js'), Preview.SECTIONS.webAudio);
    assert.ok(web.startsWith('function WebAudio() {'));
    assert.ok(!web.includes('function Video() {'));
    const audio = Preview.slice(runtime('reactor_managers.js'), Preview.SECTIONS.audioManager);
    assert.match(audio, /AudioManager\.updateBgmSequence = function/);
    assert.ok(!audio.includes('function SoundManager() {'));
    assert.throws(() => Preview.slice('nothing here', Preview.SECTIONS.webAudio), /reactor_core\.js/);
});

test('the runtime runs in a scope of its own', () => {
    const engine = fakeEngine();
    assert.equal(typeof engine.AudioManager.playBgmSequence, 'function');
    assert.equal(typeof globalThis.AudioManager, 'undefined', 'the editor gains no AudioManager');
    assert.equal(typeof globalThis.$dataSystem, 'undefined');
});

test('Preview plays the edited sequence through the game’s player; Skip moves on and Stop silences it', () => {
    const engine = fakeEngine();
    const changes = [];
    const owner = { isShown: () => true };
    const projectPath = path.join(os.tmpdir(), 'rr project');
    const result = Preview.play({ owner, projectPath, sequence: SEQUENCE, onChange: status => changes.push(status), engine, timers: timers() });
    assert.deepEqual(result, { ok: true });
    try {
        assert.deepEqual(plain(Preview.status()), { index: 0, total: 2, type: 'track', track: 'Intro', layers: null },
            'a sequence switched off on its map still previews');
        const intro = engine.WebAudio.created[0];
        assert.match(intro.url, /^file:\/\/.*rr%20project\/audio\/bgm\/Intro\.ogg$/, 'from the project’s own audio folder');
        assert.ok(intro.isPlaying());

        assert.equal(Preview.skip({}), false, 'only the list that started it skips');
        assert.equal(Preview.skip(owner), true);
        assert.equal(intro.fadedOut, Preview.SKIP_FADE, 'the skipped entry fades out under the next');
        assert.deepEqual(plain(Preview.status()), { index: 1, total: 2, type: 'palette', track: null, layers: ['Bed'] });

        Preview.skip(owner);
        assert.equal(Preview.status().index, 1, 'on the next pass the intro is skipped, as in the game');
        assert.equal(changes.at(-1).index, 1);
    } finally {
        Preview.stop();
    }
    assert.equal(Preview.isPlaying(), false);
    assert.equal(changes.at(-1), null, 'the list hears that the preview ended');
    assert.ok(engine.WebAudio.created.every(buffer => buffer.destroyed || !buffer.isPlaying()), 'nothing is left sounding');
});

test('one preview at a time, and a list that leaves the screen takes its preview with it', () => {
    const engine = fakeEngine();
    const ended = [];
    const first = { isShown: () => true };
    const second = { isShown: () => true };
    try {
        Preview.play({ owner: first, sequence: SEQUENCE, engine, timers: timers(), onChange: status => { if (!status) ended.push('first'); } });
        Preview.play({ owner: second, sequence: SEQUENCE, engine, timers: timers(), onChange: status => { if (!status) ended.push('second'); } });
        assert.deepEqual(ended, ['first'], 'starting another list’s preview ends this one');
        assert.equal(Preview.isPlaying(first), false);
        assert.equal(Preview.isPlaying(second), true);
        second.isShown = () => false;
        Preview.tick();
        assert.deepEqual(ended, ['first', 'second']);
        assert.equal(Preview.isPlaying(), false);
    } finally {
        Preview.stop();
    }
});

test('the project’s runtime plays the preview, unless it predates the music library', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-preview-'));
    try {
        const managers = runtime('reactor_managers.js');
        fs.mkdirSync(path.join(root, 'js'));
        fs.writeFileSync(path.join(root, 'js', 'reactor_core.js'), runtime('reactor_core.js'));
        fs.writeFileSync(path.join(root, 'js', 'reactor_managers.js'), managers.replace(/AudioManager\.librarySequenceData/g, 'AudioManager.somethingOlder'));
        const older = Preview.runtimeSources(root);
        assert.ok(older, 'a runtime was found');
        assert.equal(path.basename(older.dir), 'runtime', 'an older copy falls back to the editor’s runtime');
        fs.writeFileSync(path.join(root, 'js', 'reactor_managers.js'), managers);
        assert.equal(Preview.runtimeSources(root).dir, path.join(root, 'js'), 'the copy the game plays is the one previewed');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('a track stored as .mp3 is found though the runtime asks for .ogg', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-preview-ext-'));
    try {
        fs.writeFileSync(path.join(root, 'Town Theme.mp3'), 'audio');
        const utils = Preview.createUtils();
        const base = url.pathToFileURL(root).href + '/';
        assert.equal(utils.resolveAudioExtension(base + utils.encodeURI('Town Theme') + '.ogg'), base + 'Town%20Theme.mp3');
        assert.equal(utils.resolveAudioExtension(base + 'Missing.ogg'), base + 'Missing.ogg', 'a missing file is left for the load to report');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

function loadEditorClass() {
    const context = { console, module: undefined };
    context.globalThis = context;
    vm.runInNewContext(read('src/utils/BgmSequenceEditor.js') + '\n;globalThis.__E = RRBgmSequenceEditor;', context);
    return context.__E;
}

test('the list offers Preview, refuses a sequence with a fault, and swaps in Stop and Skip while it plays', () => {
    const E = loadEditorClass();
    const calls = [];
    let playing = false;
    let onChange = null;
    const preview = {
        play(options) { calls.push(options); playing = true; onChange = options.onChange; return { ok: true }; },
        stop() { calls.push('stop'); playing = false; if (onChange) onChange(null); return true; },
        skip() { calls.push('skip'); return true; },
        isPlaying() { return playing; }
    };
    const handlers = {};
    const container = { innerHTML: '', addEventListener: (type, fn) => { handlers[type] = fn; }, contains: () => true };
    const editor = new E({ container, tt: text => text, t: () => 'levels', preview, projectPath: () => '/project' });
    const click = action => handlers.click({ preventDefault() {}, target: { closest: () => ({ dataset: { action, path: '' } }) } });

    editor.load({ enabled: false, entries: [{ type: 'track', name: '' }] });
    assert.match(container.innerHTML, /data-action="preview"/);
    click('preview');
    assert.equal(calls.length, 0, 'a sequence with a fault is not played');
    assert.match(container.innerHTML, /Entry 1: choose a track\./, 'and says why');
    click('add-silence');
    assert.equal(editor.previewMessage, '', 'the message goes once the list changes');

    editor.load({ enabled: false, entries: [{ type: 'silence', duration: 2 }] });
    assert.doesNotMatch(container.innerHTML, /choose a track/, 'the message goes with the sequence it was about');
    click('preview');
    assert.equal(calls[0].projectPath, '/project');
    assert.equal(calls[0].sequence.enabled, true);
    assert.equal(calls[0].owner, editor);
    assert.match(container.innerHTML, /data-action="preview-stop"/);
    assert.match(container.innerHTML, /data-action="preview-skip"/);
    assert.doesNotMatch(container.innerHTML, /data-action="preview"/);

    click('preview-skip');
    assert.equal(calls.at(-1), 'skip');
    click('preview-stop');
    assert.equal(calls.at(-1), 'stop');
    assert.match(container.innerHTML, /data-action="preview"/, 'ending the preview puts Preview back');

    click('preview');
    editor.load({ enabled: true, entries: [] });
    assert.equal(calls.at(-1), 'stop', 'loading another sequence into the list stops its preview');

    assert.equal(editor.previewText({ index: 1, total: 3, type: 'palette', track: null, layers: ['Bed', null] }),
        'Entry 2 of 3 · Palette · Layer 1: Bed · Layer 2: Silence');
    assert.equal(editor.previewText({ index: 0, total: 3, type: 'track', track: 'Intro', layers: null }), 'Entry 1 of 3 · Track: Intro');
    assert.equal(editor.previewText({ index: 2, total: 3, type: 'silence', track: null, layers: null }), 'Entry 3 of 3 · Silence');
});

test('the preview is loaded before both lists, and both hand it their project', () => {
    const html = read('index.html');
    const at = html.indexOf('<script src="src/utils/SequencePreview.js"></script>');
    assert.ok(at > 0);
    assert.ok(at < html.indexOf('src/ProjectController.js'));
    assert.ok(at < html.indexOf('src/database/DatabaseMusicSequenceEditor.js'));
    assert.match(read('src/ProjectController.js'), /projectPath: \(\) => this\.currentProject\?\.path/);
    assert.match(read('src/database/DatabaseMusicSequenceEditor.js'), /projectPath: \(\) => this\._project\(\)\?\.path/);
});
