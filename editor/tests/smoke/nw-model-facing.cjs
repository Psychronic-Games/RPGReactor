// DISPLAY=:1 XAUTHORITY= node editor/tests/smoke/nw-model-facing.cjs [output-directory]
// Uses its own NW application/profile. No project or owner editor is opened.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { WebDriverClient } = require('./webdriver-client.cjs');
const repo = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-facing-smoke-'));
const output = path.resolve(process.argv[2] || path.join(temp, 'evidence'));
fs.mkdirSync(output, { recursive: true });

async function renderProbe(perf) {
    const R = Reactor3D, T = THREE, errors = [];
    console.error = (...args) => errors.push(args.map(String).join(' '));
    const renderer = new T.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(640, 480); renderer.setPixelRatio(1); renderer.setClearColor(0x050505);
    document.body.appendChild(renderer.domElement);
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(45, 640 / 480, .1, 100);
    camera.position.set(0, 2, 6); camera.lookAt(0, 0, 0);
    const uniforms = R.lightUniforms(); R.LightGrid.ensure(uniforms); R.LightVolume.uniforms();
    uniforms.rrLightGridEnabled.value = 0; uniforms.rrVolumeOn.value = 0; uniforms.rrDynOn.value = 0;
    uniforms.rrAmbient.value.set([.6, .6, .6]); uniforms.rrLightCount.value = 1;
    uniforms.rrLightPos.value.set([-4, 3, 4, 12]); uniforms.rrLightColor.value.set([1, 1, 1, 0]);
    uniforms.rrLightAim.value.set([.6247, -.4685, -.6247, .7]); R.setKeyLight(uniforms, 1);
    const sphere = new T.Mesh(new T.SphereGeometry(.8, 64, 48)); sphere.position.y = .1;
    const floor = new T.Mesh(new T.PlaneGeometry(8, 8)); floor.rotation.x = -Math.PI / 2; floor.position.y = -.75;
    const wall = new T.Mesh(new T.PlaneGeometry(8, 5)); wall.position.set(0, 1.2, -2);
    const thirdParty = new T.Mesh(new T.BoxGeometry(.6, .6, .6), new T.MeshStandardMaterial({ color: 0x44ff88 }));
    thirdParty.position.set(1.5, 0, 0); scene.add(new T.AmbientLight(0xffffff, 1));
    scene.add(sphere, floor, wall, thirdParty);
    const originalGlsl = R.LIGHT_GLSL, cases = [];
    for (const tier of ['weak', 'full']) for (const half of [false, true]) {
        R.gpuTierOverride = tier;
        const materials = [sphere, floor, wall].map((mesh, i) => {
            const m = new T.MeshBasicMaterial({ color: [0xffa040, 0x4488ff, 0xff4455][i], side: T.DoubleSide });
            if (!i) m.__reactorModel = true;
            R.litMaterial(m); mesh.material = half ? R.HalfLight.twin(m) : m; return m;
        });
        const target = new T.WebGLRenderTarget(640, 480);
        target.depthTexture = new T.DepthTexture(640, 480);
        // Compile the actual quarter-light fullscreen program as well as the material twins.
        if (half) {
            const program = R.HalfLight.program(renderer, false);
            renderer.setRenderTarget(target); renderer.render(scene, camera);
            program.material.uniforms.rrLightDepth.value = target.depthTexture;
            const lightTarget = new T.WebGLRenderTarget(160, 120);
            renderer.setRenderTarget(lightTarget); renderer.render(program.scene, program.camera); lightTarget.dispose();
        }
        renderer.setRenderTarget(target); renderer.render(scene, camera);
        const bytes = new Uint8Array(640 * 480 * 4); renderer.readRenderTargetPixels(target, 0, 0, 640, 480, bytes);
        const counts = { model: 0, floor: 0, wall: 0, thirdParty: 0 };
        for (let i = 0; i < bytes.length; i += 4) {
            const [r, g, b] = bytes.subarray(i, i + 3);
            if (r > 25 && r > g * 1.2 && g > b * 1.4) counts.model++;
            if (b > 25 && b > r * 1.3 && b > g * 1.2) counts.floor++;
            if (r > 25 && r > g * 1.5 && b > g * 1.1 && b < r) counts.wall++;
            if (g > 25 && g > r * 1.3 && g > b * 1.1) counts.thirdParty++;
        }
        renderer.setRenderTarget(null); renderer.render(scene, camera);
        cases.push({ tier, half, counts, glError: renderer.getContext().getError(), image: renderer.domElement.toDataURL() });
        for (const m of materials) m.dispose(); target.dispose();
    }
    R.LIGHT_GLSL = originalGlsl;
    const local = [];
    R.gpuTierOverride = 'weak';
    scene.remove(floor, wall, thirdParty);
    camera.position.set(0, .1, 6); camera.lookAt(0, .1, 0);
    for (const type of [0, 1, 2]) {
        uniforms.rrLightColor.value[3] = type;
        uniforms.rrLightAim.value[3] = type === 2 ? 4 : .5;
        sphere.material = R.litMaterial(Object.assign(new T.MeshBasicMaterial({ color: 0xffffff }), { __reactorModel: true }));
        // Shader helper only: the albedo twin lets pixel probes isolate the facing ratio.
        sphere.material = R.HalfLight.twin(sphere.material);
        const target = new T.WebGLRenderTarget(640, 480); renderer.setRenderTarget(target); renderer.render(scene, camera);
        const bytes = new Uint8Array(640 * 480 * 4); renderer.readRenderTargetPixels(target, 0, 0, 640, 480, bytes);
        const pixel = x => bytes[(240 * 640 + x) * 4];
        local.push({ type, left: pixel(280), right: pixel(360) }); target.dispose();
    }
    const timings = [];
    if (perf) {
        const gl = renderer.getContext(), clock = () => Number(process.hrtime.bigint()) / 1e6, timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        const models = Array.from({ length: 12 }, (_, i) => {
            const mesh = new T.Mesh(sphere.geometry); mesh.position.set((i % 4 - 1.5) * .8, (Math.floor(i / 4) - 1) * .8, 0); mesh.frustumCulled = false; scene.add(mesh); return mesh;
        });
        scene.remove(sphere);
        for (const lightCount of [2, 32]) {
            uniforms.rrLightCount.value = lightCount;
            for (let i = 0; i < lightCount; i++) {
                uniforms.rrLightPos.value.set([Math.cos(i) * 4, 2, Math.sin(i) * 4, 10], i * 4);
                uniforms.rrLightColor.value.set([.2, .2, .2, 0], i * 4);
            }
            for (const before of [true, false, false, true, false, true]) {
                R.LIGHT_GLSL = before ? originalGlsl.replace(/float rrFaceShare\(vec3 n\) \{[\s\S]*?\n\}/, 'float rrFaceShare(vec3 n) {return 1.0 - 0.120 * (1.0 - n.y);}') : originalGlsl;
                const material = R.litMaterial(Object.assign(new T.MeshBasicMaterial({ color: 0xffffff }), { __reactorModel: true }));
                const twin = R.HalfLight.twin(material); for (const mesh of models) mesh.material = twin;
                renderer.setRenderTarget(null);
                for (let i = 0; i < 10; i++) renderer.render(scene, camera);
                gl.finish(); const start = clock(), query = timer && gl.createQuery();
                if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
                for (let i = 0; i < 80; i++) renderer.render(scene, camera);
                if (query) gl.endQuery(timer.TIME_ELAPSED_EXT);
                gl.finish(); const row = { lightCount, before, msPerDraw: (clock() - start) / 80, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, glError: gl.getError() };
                if (query) {
                    for (let n = 0; n < 300 && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE); n++) await new Promise(resolve => setTimeout(resolve, 10));
                    if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(timer.GPU_DISJOINT_EXT)) row.gpuMsPerDraw = gl.getQueryParameter(query, gl.QUERY_RESULT) / 80e6;
                    gl.deleteQuery(query);
                }
                timings.push(row);
                twin.dispose(); material.dispose();
            }
        }
    }
    R.LIGHT_GLSL = originalGlsl;
    renderer.dispose(); return { cases, local, timings, errors };
}

(async () => {
    const driver = new WebDriverClient(path.join(repo, 'nwjs-linux/chromedriver'), { env: { ...process.env } });
    try {
        const scripts = ['runtime/libs/three.js', 'runtime/reactor_3d.js', 'runtime/reactor_3d_lighting.js'].map(f => `<script src="${pathToFileURL(path.join(repo, f)).href}"></script>`).join('\n');
        fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ name: 'model-facing-smoke', main: 'index.html', window: { width: 700, height: 540 } }));
        fs.writeFileSync(path.join(temp, 'index.html'), `<!doctype html><body>${scripts}<script>(${renderProbe})(${process.argv.includes('--perf')}).then(r=>{window.probe=r;window.done=true;},e=>{window.probe={failure:String(e.stack)};window.done=true;});</script>`);
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { args: ['nwapp=' + temp, 'user-data-dir=' + path.join(temp, 'profile'), 'no-first-run'] } });
        await driver.waitForScript('return window.done;', [], { timeout: 90000 });
        const result = await driver.execute('return window.probe;');
        assert.equal(result.failure, undefined);
        for (const row of result.cases) {
            fs.writeFileSync(path.join(output, `${row.tier}-${row.half ? 'half' : 'whole'}.png`), Buffer.from(row.image.split(',')[1], 'base64')); delete row.image;
        }
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(result, null, 2));
        assert.deepEqual(result.errors, []);
        for (const row of result.cases) {
            assert.equal(row.glError, 0);
            for (const [kind, count] of Object.entries(row.counts)) assert.ok(count > 100, `${row.tier}/${row.half}: ${kind} rendered ${count} pixels`);
        }
        for (const row of result.local) assert.ok(row.left > row.right + 5, `local light ${row.type} shapes the model: ${row.left}/${row.right}`);
        console.log(JSON.stringify(result, null, 2));
    } finally { await driver.close().catch(() => {}); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
