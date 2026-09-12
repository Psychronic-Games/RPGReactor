#!/usr/bin/env node
'use strict';
// Real browser media startup in an iframe, without needing the private Demo assets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-web-room-media-'));
const roomSource = process.argv.find(arg => arg.startsWith('--room='))?.slice(7) || path.join(root, 'runtime/reactor_battle_room.js');
const managerSource = fs.readFileSync(path.join(root, 'runtime/reactor_managers.js'), 'utf8');
const rejectionHandler = managerSource.slice(managerSource.indexOf('SceneManager.onReject ='), managerSource.indexOf('SceneManager.onUnload ='));
const preview = `<!doctype html><button id="resume">Resume</button>
<script>window.failures=[];window.cancellations=0;window.SceneManager={onError:e=>failures.push(String(e.reason))};${rejectionHandler}
addEventListener('unhandledrejection',e=>{SceneManager.onReject(e);if(e.defaultPrevented)cancellations++;});</script>
<script src="/three.js"></script><script src="/room.js"></script>
<script>
window.warnings=[];window.Reactor3D={};
window.view=Object.create(ReactorBattleRoomView.prototype);
view.assets={mediaUrl:file=>'/'+file,warn:m=>warnings.push(m)};
view.effectActive=()=>true;view.updateMapMediaPlane=()=>{};
window.record={object:new THREE.Group(),effects:Array.from({length:10},()=>({type:'video',video:{file:'clip.webm',audio:true},surface:{}}))};
view.updateMedia(record);
</script>`;
const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    if (name === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<iframe id="preview" src="/preview" width="800" height="600"></iframe>'); }
    if (name === '/preview') { res.setHeader('Content-Type', 'text/html'); return res.end(preview); }
    const files = { '/three.js': path.join(root, 'runtime/libs/three.js'), '/room.js': roomSource, '/clip.webm': path.join(temp, 'clip.webm') };
    if (!files[name]) return res.writeHead(404).end();
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'video/webm');
    fs.createReadStream(files[name]).pipe(res);
});
const driver = new WebDriverClient(process.env.CHROMEDRIVER_BIN || '/usr/bin/chromedriver');
(async () => {
    try {
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=10', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1', '-c:v', 'libvpx', '-c:a', 'libopus', path.join(temp, 'clip.webm')]);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': {
            binary: process.env.CHROME_BIN || '/usr/bin/chromium',
            args: ['--headless=new', '--no-sandbox', '--autoplay-policy=document-user-activation-required']
        } });
        await driver.navigate('http://127.0.0.1:' + server.address().port + '/');
        const frame = await driver.sessionRequest('POST', '/element', { using: 'css selector', value: '#preview' });
        await driver.sessionRequest('POST', '/frame', { id: frame });
        await driver.waitForScript('return !!window.record && [...record.media.values()].every(m=>m.element.readyState>=2);');
        const blocked = await driver.execute('return [...record.media.values()].map(m=>({failed:!!m.failed,retry:!!m.retryGesture,paused:m.element.paused}));');
        assert.ok(blocked.every(m => !m.failed && m.retry && m.paused), JSON.stringify(blocked));
        const button = await driver.sessionRequest('POST', '/element', { using: 'css selector', value: '#resume' });
        await driver.sessionRequest('POST', '/element/' + button['element-6066-11e4-a52e-4f735466cecf'] + '/click', {});
        await driver.waitForScript('return [...record.media.values()].every(m=>!m.element.paused&&!m.retryGesture&&m.texture);');
        console.log('Ten blocked room videos recover after a real click inside the iframe.');
        const results = await driver.executeAsync(`const done=arguments[0];
            for(const m of record.media.values())view.stopMedia(m);
            const early={object:new THREE.Group(),effects:[{type:'video',video:{file:'clip.webm'},surface:{}}]};
            view.updateMedia(early);for(const m of early.media.values())view.stopMedia(m);
            // Reproduce a legacy plugin's uncaught play/pause race with native media.
            const legacy=document.createElement('video');legacy.preload='none';legacy.muted=true;legacy.src='/clip.webm';legacy.play();legacy.pause();
            setTimeout(()=>{legacy.removeAttribute('src');legacy.load();done({failures,warnings,cancellations,disposed:[...record.media.values(),...early.media.values()].every(m=>m.disposed&&!m.retryGesture)});},300);`);
        assert.deepEqual(results.failures, []); assert.deepEqual(results.warnings, []);
        assert.equal(results.disposed, true); assert.equal(results.cancellations, 1);
        console.log('Immediate room disposal stays quiet; native legacy play/pause cancellation does not stop the game.');
        await driver.execute(`window.missing={object:new THREE.Group(),effects:['missing.webm','missing.png'].map(file=>({type:'video',video:{file},surface:{}}))};view.updateMedia(missing);`);
        await driver.waitForScript('return [...missing.media.values()].every(m=>m.failed);');
        const missing = await driver.execute('for(let i=0;i<30;i++)view.updateMedia(missing);return {warnings,failures,hidden:[...missing.media.values()].every(m=>!m.plane.visible&&!m.texture)};');
        assert.equal(missing.warnings.length, 2); assert.equal(missing.hidden, true); assert.deepEqual(missing.failures, []);
        await driver.execute('for(const m of missing.media.values())view.stopMedia(m);');
        console.log('Missing video/image warn once each without failing the battle or creating invalid textures.');
    } finally {
        await driver.close(); server.close(); fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
