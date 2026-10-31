#!/usr/bin/env node
/** Four real WebGL upgrade cases; run through codex-check + headless-native.cjs. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const out = path.resolve(process.argv.find(a => a.startsWith('--out='))?.slice(6) || 'scratchpad/pixi-upgrade');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-pixi-upgrade-'));
fs.mkdirSync(out, { recursive: true });
fs.symlinkSync(path.join(root, 'runtime/libs'), path.join(temp, 'libs'));
fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ name: 'reactor-pixi-upgrade', main: 'index.html', window: { width: 640, height: 480 }, 'chromium-args': '--no-sandbox --force-high-performance-gpu --use-gl=angle --use-angle=gl' }));
fs.writeFileSync(path.join(temp, 'index.html'), `<!doctype html><body><script>window.__errors=[];addEventListener('error',e=>__errors.push(String(e.error?.stack||e.message)));</script><script src="libs/pixi.js"></script><script src="libs/pixi_compat.js"></script><script>window.ready=(async()=>{window.renderer=await PIXI.autoDetectRenderer({width:32,height:32,preference:'webgl',backgroundAlpha:0,antialias:false});document.body.appendChild(renderer.canvas);})();</script>`);
const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver'));
(async () => { try {
    await driver.start();
    await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { args: [`nwapp=${temp}`, `user-data-dir=${temp}/profile`, 'no-first-run', 'mute-audio', 'js-flags=--max-old-space-size=1024'] } });
    const ready = await driver.executeAsync('const done=arguments[arguments.length-1];window.ready.then(()=>done(true),e=>done(String(e.stack)));');
    assert.equal(ready, true);
    const report = await driver.execute(`
        const P=PIXI,r=renderer,results=[];
        for(const resolution of [1,2]){
            const bytes=new Uint8Array(32);for(let i=0;i<8;i++)bytes.set([255,0,0,255],i*4);
            const t=P.Texture.fromBuffer(bytes,4,2,{resolution}),stage=new P.Container(),s=new P.Sprite(t);s.width=4;s.height=2;stage.addChild(s);
            const read=()=>{const c=r.extract.canvas({target:stage});return Array.from(c.getContext('2d').getImageData(0,0,4,2).data);};
            read();for(let i=0;i<8;i++)bytes.set([0,255,0,255],i*4);for(let i=2;i<6;i++)bytes.set([0,0,255,255],i*4);
            t.source.update(2,6);const partial=read();t.source.update();const full=read();
            results.push({case:'partial-buffer',resolution,partial,full,gl:r.gl.getError()});stage.destroy({children:true});t.destroy(true);
        }
        const stage=new P.Container(),nested=new P.Container(),quad=new P.Sprite(P.Texture.WHITE);quad.position.set(4,4);quad.width=quad.height=8;nested.addChild(quad);stage.addChild(nested);
        const outer=new P.AlphaFilter({alpha:.5}),inner=new P.AlphaFilter({alpha:.5});stage.filters=[outer];nested.filters=[inner];
        const resized=[];for(const size of [32,64,16,32]){r.resize(size,size);r.render({container:stage,clear:true});const p=new Uint8Array(4);r.gl.readPixels(6,size-7,1,1,r.gl.RGBA,r.gl.UNSIGNED_BYTE,p);resized.push({size,pixel:Array.from(p),gl:r.gl.getError()});}
        results.push({case:'nested-filter-resize',resized});stage.destroy({children:true});outer.destroy();inner.destroy();
        const group=new P.Container(),a=new P.Container(),b=new P.Container();group.addChild(a,b);a.position.set(20,4);a.scale.x=-1;b.position.set(4,4);
        const texture=P.Texture.fromBuffer(new Uint8Array([255,0,0,255,0,0,255,255]),2,1),sprite=new P.Sprite(texture);sprite.position.set(2,2);sprite.scale.set(4,4);a.addChild(sprite);
        const picture=()=>{r.render({container:group,clear:true});const p=new Uint8Array(32*32*4);r.gl.readPixels(0,0,32,32,r.gl.RGBA,r.gl.UNSIGNED_BYTE,p);let hash=2166136261,visible=0;for(const value of p){hash=Math.imul(hash^value,16777619);if(value)visible++;}return{hash:hash>>>0,visible,gl:r.gl.getError()};};
        const before=picture();b.reparentChild(sprite);const after=picture();results.push({case:'mirrored-reparent',before,after});group.destroy({children:true});texture.destroy(true);
        const accessibleStage=new P.Container(),button=new P.Sprite(P.Texture.WHITE);button.width=button.height=24;button.accessible=true;button.accessibleText='Reactor upgrade control';button.eventMode='static';button.hitArea=new P.Rectangle(0,0,24,24);accessibleStage.addChild(button);
        let contexts=0;button.on('contextmenu',e=>{contexts++;e.preventDefault();});r.render({container:accessibleStage,clear:true});
        const bounds=r.canvas.getBoundingClientRect(),menu=new MouseEvent('contextmenu',{clientX:bounds.x+8,clientY:bounds.y+8,button:2,bubbles:true,cancelable:true});r.canvas.dispatchEvent(menu);
        const inactive=!r.accessibility.isActive;document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',keyCode:9,bubbles:true}));r.render({container:accessibleStage,clear:true});
        results.push({case:'accessible-input',inactive,active:r.accessibility.isActive,text:button._accessibleDiv?.textContent,tag:button._accessibleDiv?.tagName,contexts,prevented:menu.defaultPrevented,gl:r.gl.getError()});
        accessibleStage.destroy({children:true});
        return {version:P.VERSION,results,errors:__errors};
    `);
    report.logs = await driver.sessionRequest('POST', '/log', { type: 'browser' });
    fs.writeFileSync(path.join(out, 'upgrade.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    assert.equal(report.version, JSON.parse(fs.readFileSync(path.join(root, 'editor/package.json'))).dependencies['pixi.js']);
    assert.equal(report.errors.length, 0);
    for (const buffer of report.results.filter(r => r.case === 'partial-buffer')) {
        assert.equal(buffer.gl, 0);
        for (let i = 0; i < 8; i++) {
            const changed = i >= 2 && i < 6;
            assert.deepEqual(buffer.partial.slice(i * 4, i * 4 + 4), changed ? [0, 0, 255, 255] : [255, 0, 0, 255], `partial texel ${i}, resolution ${buffer.resolution}`);
            assert.deepEqual(buffer.full.slice(i * 4, i * 4 + 4), changed ? [0, 0, 255, 255] : [0, 255, 0, 255]);
        }
    }
    for (const resized of report.results.find(r => r.case === 'nested-filter-resize').resized) {
        assert.equal(resized.gl, 0); for (const value of resized.pixel) assert.ok(Math.abs(value - 64) <= 1, `nested alpha after resize to ${resized.size}: ${resized.pixel}`);
    }
    const mirror = report.results.find(r => r.case === 'mirrored-reparent');
    assert.ok(mirror.before.visible > 0); assert.deepEqual(mirror.after, mirror.before);
    const input = report.results.find(r => r.case === 'accessible-input');
    assert.equal(input.inactive, true); assert.equal(input.active, true); assert.equal(input.text, 'Reactor upgrade control'); assert.equal(input.tag, 'BUTTON');
    assert.equal(input.contexts, 1); assert.equal(input.prevented, true); assert.equal(input.gl, 0);
    assert.equal(report.logs.filter(l => /GL_INVALID|INVALID_OPERATION|TypeError|ReferenceError/i.test(l.message)).length, 0);
} finally { await driver.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
