// Every Effekseer context the runtime or the editor creates gets the same instance pool, so the game and its
// previews drop particles at the same count (Effekseer skips a new particle silently when the pool is full).
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

test('the runtime and the editor previews use one pool size, above Effekseer\'s default 4000', () => {
  const runtime = runtimeSettings();
  const editor = require(path.join(root, 'editor/src/utils/EffekseerContextSettings.js'));
  assert.deepEqual({ ...editor }, { ...runtime });
  assert.ok(Number.isInteger(runtime.instanceMaxCount) && runtime.instanceMaxCount > 4000);
  assert.ok(runtime.squareMaxCount >= 10000);
});

test('every effekseer.createContext() is initialized with the shared settings', () => {
  const files = [...jsFiles(path.join(root, 'runtime')), ...jsFiles(path.join(root, 'editor/src'))];
  let sites = 0;
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!/effekseer\.createContext\(\)/.test(line)) return;
      sites++;
      const init = lines.slice(i, i + 10).find((l) => /\.init\(/.test(l));
      assert.ok(init, `${path.relative(root, file)}:${i + 1} has no init after createContext`);
      assert.match(init, /effekseerContextSettings|RREffekseerContextSettings/, `${path.relative(root, file)}:${i + 1} inits without the shared settings: ${init.trim()}`);
    });
  }
  assert.ok(sites >= 10, 'found ' + sites + ' createContext sites');
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
