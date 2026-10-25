'use strict';
// Run with DISPLAY=:1 XAUTHORITY= XDG_SESSION_TYPE=x11 env -u WAYLAND_DISPLAY node <this file>.
// Set RR_HEADLESS=1 for an isolated SwiftShader run without a display.
// A served page with NW's Node integration disabled exercises the actual classic Worker and fetch path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { WebDriverClient } = require('./webdriver-client.cjs');
const repo = path.resolve(__dirname, '../../..'), editor = path.join(repo, 'editor');
const Taken = require('../../src/forge/Character3D/CharacterOutfitTransfer.js');
const Wardrobe = require('../../src/forge/Character3D/CharacterWardrobe.js');
const Model = require('../../src/forge/Character3D/CharacterModel.js');
const Creature = require('../../src/forge/Character3D/CreatureBody.js');
const imported = Taken.load('carol');
const outfit = Object.fromEntries(Object.entries(imported).filter(([key, value]) => !key.startsWith('_') && typeof value !== 'function'));
outfit.parts = outfit.parts.map(p => Object.assign({}, p, { id: 'outfit' }));
const snapshot = JSON.stringify(outfit, (key, value) => ArrayBuffer.isView(value) ? { $type: value.constructor.name, values: [...value] } : value);
const page = `<!doctype html><script src="/src/forge/Character3D/CharacterPreviewBrowser.js"></script><script>
window.probe = { node: typeof require, mainModel: typeof RRCharacterModel, worker: typeof Worker };
window.done = false;
(async () => {
    const outfit = JSON.parse(await (await fetch('/snapshot')).text(), (key, value) => value && value.$type ? new window[value.$type](value.values) : value);
    const pool = new RRCharacterPreviewWorker.PreviewWorker({ timeoutMs: 90000 });
    const picture = { width: 1, height: 1, data: new Uint8Array([255, 20, 30, 255]) };
    pool.configure({ eyeSource: picture, emblemPictures: new Map([['Logo', picture]]),
        transfers: [{ key: 'project:Preview', id: 'taken_preview', label: 'Preview coat', outfit, picture }] });
    let pulse = performance.now(), maxGap = 0, pulses = 0;
    const timer = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - pulse); pulse = now; pulses++; }, 10);
    const out = [];
    try {
        for (const [key, recipe] of [
            ['bikini', { gender: 1, outfit: [{ id: 'bikiniTop' }, { id: 'bikiniBottom' }], hair: { style: 'bald' } }],
            ['captain', { gender: 1, extreme: true, weight: 4, outfit: [{ id: 'ss_carol_uniform' }], hair: { style: 'bald' } }],
            ['modeled', { outfit: [{ id: 'mh_suit' }, { id: 'mh_boots' }], hair: { style: 'bald' } }],
            ['knight', { outfit: ${JSON.stringify(Wardrobe.PRESETS.find(p => p.id === 'knight').items)}, hair: { style: 'bald' } }],
            ['darkknight', { outfit: ${JSON.stringify(Wardrobe.PRESETS.find(p => p.id === 'darkknight').items)}, hair: { style: 'bald' } }],
            ['emblem', { outfit: [{ id: 'tshirt', pattern: 'emblem', emblemPicture: 'Logo' }] }],
            ['project', { outfit: [{ id: 'taken_preview' }], hair: { style: 'bald' } }],
            ['wolf', { plan: 'quadruped', kind: 'wolf' }],
            ['tick', { plan: 'quadruped', kind: 'tick' }],
            ['bee', { plan: 'quadruped', kind: 'bee' }],
            ['lobster', { plan: 'quadruped', kind: 'lobster' }],
            ['bird', { plan: 'quadruped', kind: 'avian', birdType: 'owl' }],
            ['eagle', { plan: 'quadruped', kind: 'avian', birdType: 'eagle' }],
            ['bat', { plan: 'quadruped', kind: 'bat' }],
            ['maineCoon', { plan: 'quadruped', kind: 'cat', catType: 'maineCoon' }],
            ['hydrata', ${JSON.stringify(Model.withSpecies({}, 'hydrata'))}],
            ['vampire', ${JSON.stringify(Model.withSpecies({}, 'vampire'))}],
            ['clothDetail', {outfit:[{id:'tshirt',pattern:'plaid'},{id:'jeans'}],hair:{style:'bald'}}],
            ['animalCloth', ${JSON.stringify({...Creature.kindRecipe('horse'),gear:[{id:'caparison'},{id:'saddle'}]})}],
            ['constructedCloth', {gender:1,outfit:[{id:'gambeson'},{id:'tabard'},{id:'jeans'}],props:[{id:'brooch'}],hair:{style:'bald'}}],
            ['constructedAccessories', {hair:{style:'bald'},props:[{id:'cap',billLength:1.3,height:.8},{id:'backpack',pockets:3},{id:'lantern',side:'left'},{id:'choker',shape:'lace'},{id:'satchel',side:'right'}]}],
            ['mechanicalAccessories', {hair:{style:'bald'},props:[{id:'jetpack',vents:8},{id:'respirator'}]}],
            ['companionWear', ${JSON.stringify({...Creature.kindRecipe('cat'),gear:[{id:'bandana'},{id:'weatherCoat'}]})}],
            ['beastfolkFur', ${JSON.stringify(Model.withSpecies({},'catfolk'))}],
            ['courier', {outfit:${JSON.stringify(Wardrobe.PRESETS.find(p=>p.id==='courier').items)},props:[{id:'utilityHarness'}]}],
            ['barbarian', {outfit:${JSON.stringify(Wardrobe.PRESETS.find(p=>p.id==='barbarian').items)}}],
            ['gladiator', {outfit:${JSON.stringify(Wardrobe.PRESETS.find(p=>p.id==='gladiator').items)}}],
            ['trooper', {outfit:${JSON.stringify(Wardrobe.PRESETS.find(p=>p.id==='trooper').items)}}],
            ['recon', {outfit:${JSON.stringify(Wardrobe.PRESETS.find(p=>p.id==='reconTeam').items)}}],
            ['flight', {outfit:${JSON.stringify(Wardrobe.PRESETS.find(p=>p.id==='flightCrew').items)}}]
        ]) {
            const start = performance.now(), request = { key, recipe, cacheKey: key, options: { skinSize: 128, atlasSize: key==='clothDetail'?1024:128 } };
            const pending = pool.build(request);
            if (pending !== pool.build(request)) throw Error('Identical browser jobs were not deduplicated');
            const r = await pending;
            out.push({ key, parts: r.parts.length, triangles: r.parts.reduce((s, p) => s + p.index.length / 3, 0), finite: r.parts.every(p => p.positions.every(Number.isFinite) && p.normals.every(Number.isFinite)), textures: Object.keys(r.textures), stats: r.stats, elapsed: performance.now() - start });
        }
        window.result = { probe: window.probe, out, maxGap, pulses };
    } finally { pool.dispose(); clearInterval(timer); }
})().catch(error => { window.result = { error: String(error.stack || error), probe: window.probe }; }).finally(() => { window.done = true; });
</script>`;

(async () => {
    const server = http.createServer((request, response) => {
        if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(page); return; }
        if (request.url === '/snapshot') { response.setHeader('Content-Type', 'application/json'); response.end(snapshot); return; }
        const file = path.resolve(editor, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
        if (!file.startsWith(editor + path.sep)) { response.statusCode = 403; response.end(); return; }
        const types = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
        response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
        fs.createReadStream(file).on('error', () => { response.statusCode = 404; response.end(); }).pipe(response);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-browser-preview-'));
    fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ name: 'rr-preview-browser-test', version: '1.0.0',
        main: 'http://127.0.0.1:' + server.address().port + '/', nodejs: false, window: { show: false } }));
    const sdk = process.env.NWJS_SDK_ROOT || path.join(repo, process.platform === 'win32' ? 'nwjs-win' : process.platform === 'darwin' ? 'nwjs-mac' : 'nwjs-linux');
    const binary = path.join(sdk, process.platform === 'win32' ? 'nw.exe' : process.platform === 'darwin' ? 'nwjs.app/Contents/MacOS/nwjs' : 'nw');
    const driver = new WebDriverClient(path.join(sdk, process.platform === 'win32' ? 'chromedriver.exe' : 'chromedriver'), { env: { ...process.env } });
    try {
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { binary, args: ['nwapp=' + temp, 'user-data-dir=' + path.join(temp, 'profile'), 'no-first-run',...(process.env.RR_HEADLESS?['headless=new','no-sandbox','enable-unsafe-swiftshader','use-gl=angle','use-angle=swiftshader']:[])] } });
        await driver.setScriptTimeout(120000);
        await driver.waitForScript('return window.done === true', [], { timeout: 120000 });
        const result = await driver.execute('return window.result');
        console.log(JSON.stringify(result, null, 2));
        assert.equal(result.error, undefined); assert.equal(result.probe.node, 'undefined'); assert.equal(result.probe.mainModel, 'undefined');
        assert.equal(result.out.length, 30); assert.ok(result.pulses > 20); assert.ok(result.maxGap < 120, 'preview builds must not block the page');
        for (const item of result.out) { assert.equal(item.stats.threadId, 'browser'); assert.ok(item.parts > 0 && item.triangles > 0 && item.stats.bytes > 0 && item.finite); }
        assert.ok(result.out.find(r => r.key === 'captain').textures.includes('outfit-carol.png'));
        assert.ok(result.out.find(r => r.key === 'modeled').textures.includes('cloth-mh_suit.png'));
        assert.ok(result.out.find(r => r.key === 'emblem').textures.includes('outfit.png'));
        assert.ok(result.out.find(r => r.key === 'project').textures.includes('outfit-project-Preview.png'));
        assert.ok(result.out.find(r=>r.key==='clothDetail').textures.includes('outfit-normal.png'));
        assert.ok(result.out.find(r=>r.key==='hydrata').textures.includes('skin-scales-normal.png'));
        assert.ok(result.out.find(r=>r.key==='recon').textures.includes('recon-textile-normal.png'));
        assert.ok(result.out.find(r=>r.key==='animalCloth').textures.includes('gear-cloth-normal.png'));
    } finally { await driver.close().catch(() => {}); server.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
