// The Effekseer contexts that play effects (the in-scene context, the 3D map's effects context, the overlay when it
// draws screen animations, and every editor preview) get the same instance pool, so the game and its previews drop
// particles at the same count (Effekseer skips a new particle silently when the pool is full). The overlay made at
// boot keeps Effekseer's default pool while screen animations play in the scene: there it only loads effects.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'libs' && e.name !== 'node_modules') out.push(...jsFiles(p)); }
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function runtimeSettings() {
  const src = fs.readFileSync(path.join(root, 'runtime/reactor_core.js'), 'utf8');
  const m = src.match(/Graphics\.effekseerContextSettings = (\{[^}]*\});/);
  assert.ok(m, 'runtime/reactor_core.js defines Graphics.effekseerContextSettings');
  return vm.runInNewContext('(' + m[1] + ')');
}

/** The init line after each `effekseer.createContext()` in a file. */
function initsAfterCreate(file) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    if (!/effekseer\.createContext\(\)/.test(line)) return;
    const init = lines.slice(i, i + 10).find((l) => /\.init\(/.test(l));
    assert.ok(init, `${file}:${i + 1} has no init after createContext`);
    out.push(init.trim());
  });
  return out;
}

test('the runtime and the editor previews use one pool size, above Effekseer\'s default 4000', () => {
  const runtime = runtimeSettings();
  const editor = require(path.join(root, 'editor/src/utils/EffekseerContextSettings.js'));
  assert.deepEqual({ ...editor }, { ...runtime });
  assert.ok(Number.isInteger(runtime.instanceMaxCount) && runtime.instanceMaxCount > 4000);
  assert.ok(runtime.squareMaxCount >= 10000);
});

test('the contexts that play effects take the large pool; the boot-time overlay is sized by Graphics._overlayEffekseerSettings', () => {
  // The in-scene context and the 3D map's effects context are made at their first use, and play effects.
  const sprites = initsAfterCreate('runtime/reactor_sprites.js');
  assert.equal(sprites.length, 1, 'one in-scene context');
  assert.match(sprites[0], /Graphics\.effekseerContextSettings/);
  const gpu = initsAfterCreate('runtime/reactor_3d_effects.js');
  assert.equal(gpu.length, 1, 'one 3D effects context');
  assert.match(gpu[0], /Graphics\.effekseerContextSettings/);
  const sceneLayer = fs.readFileSync(path.join(root, 'runtime/reactor_sprites.js'), 'utf8');
  assert.match(sceneLayer, /ensureContext\(\) \{\s*if \(this\.context\) return this\.context;/, 'the in-scene context is made once, at first use');
  // The overlay (made at boot, and again after a lost context) asks the helper both times.
  const core = initsAfterCreate('runtime/reactor_core.js');
  assert.equal(core.length, 2, 'boot and restore');
  for (const init of core) assert.match(init, /this\._overlayEffekseerSettings\(\)/, init);
  // Every editor preview keeps the shared settings.
  let sites = 0;
  for (const file of jsFiles(path.join(root, 'editor/src'))) {
    for (const init of initsAfterCreate(path.relative(root, file))) {
      sites++;
      assert.match(init, /RREffekseerContextSettings|effekseerContextSettings/, `${path.relative(root, file)} inits without the shared settings: ${init}`);
    }
  }
  assert.ok(sites >= 6, 'found ' + sites + ' editor createContext sites');
});

test('the overlay keeps Effekseer\'s default pool only while screen animations play in the scene', () => {
  const src = fs.readFileSync(path.join(root, 'runtime/reactor_core.js'), 'utf8');
  const m = src.match(/Graphics\._overlayEffekseerSettings = function\(\) \{[\s\S]*?\r?\n\};/);
  assert.ok(m, 'runtime/reactor_core.js defines Graphics._overlayEffekseerSettings');
  const settings = runtimeSettings();
  const helper = (spriteAnimation) => {
    const sandbox = { Graphics: { effekseerContextSettings: settings } };
    if (spriteAnimation !== undefined) sandbox.Sprite_Animation = spriteAnimation;
    vm.runInNewContext(m[0], sandbox);
    return sandbox.Graphics._overlayEffekseerSettings();
  };
  assert.equal(helper({ SceneLayer: { active: () => true } }), undefined, 'in-scene active: the overlay only loads effects');
  assert.equal(helper({ SceneLayer: { active: () => false } }), settings, 'in-scene inactive: the overlay draws screen animations');
  assert.equal(helper(undefined), settings, 'no Sprite_Animation');
  assert.equal(helper({}), settings, 'no SceneLayer');
  assert.equal(helper({ SceneLayer: { active() { throw new Error('boom'); } } }), settings, 'a throw');
});

test('the editor loads the settings before any preview script', () => {
  const html = fs.readFileSync(path.join(root, 'editor/index.html'), 'utf8');
  const at = (s) => html.indexOf(s);
  assert.ok(at('src/utils/EffekseerContextSettings.js') > at('libs/effekseer.min.js'));
  for (const s of ['AnimationPreviewLayer.js', 'DatabaseAnimationEditor.js', 'AnimationPicker.js', 'AnimationPickerModal.js'])
    assert.ok(at('src/utils/EffekseerContextSettings.js') < at(s), s);
});

test('the Demo template carries the same runtime files', () => {
  for (const f of ['reactor_core.js', 'reactor_sprites.js', 'reactor_3d_effects.js'])
    assert.equal(fs.readFileSync(path.join(root, 'template/Demo/js', f), 'utf8'), fs.readFileSync(path.join(root, 'runtime', f), 'utf8'), f);
});
