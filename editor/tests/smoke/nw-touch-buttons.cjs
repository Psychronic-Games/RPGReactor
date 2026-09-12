#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const source = path.resolve(process.argv[2] || path.join(root, 'template/Demo'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-touch-buttons-'));
const project = path.join(temp, 'game');
const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver'));
const checks = [];
const wait = () => driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,180);');
async function click(expression, touch = false) {
    const point = await driver.execute(`const button=${expression},p=button.toGlobal(new PIXI.Point(button.width/2,button.height/2)),r=Graphics._canvas.getBoundingClientRect();return {x:r.left+p.x*r.width/Graphics.width,y:r.top+p.y*r.height/Graphics.height,enabled:button.isClickEnabled()};`);
    assert.equal(point.enabled, true, 'visible button accepts pointer input');
    if (touch) {
        await driver.executeAsync(`const done=arguments[arguments.length-1],p=arguments[0],canvas=Graphics._canvas;
            const finger=new Touch({identifier:1,target:canvas,clientX:p.x,clientY:p.y,pageX:p.x+scrollX,pageY:p.y+scrollY});
            canvas.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[finger],targetTouches:[finger],changedTouches:[finger]}));
            setTimeout(()=>{canvas.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[finger]}));setTimeout(done,180);},80);`, [point]);
    } else {
        await driver.sessionRequest('POST', '/actions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
            { type: 'pointerMove', duration: 0, origin: 'viewport', x: Math.round(point.x), y: Math.round(point.y) },
            { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 80 }, { type: 'pointerUp', button: 0 }
        ] }] });
        await wait();
    }
}
(async () => {
    try {
        fs.mkdirSync(project);
        fs.cpSync(path.join(source, 'js'), path.join(project, 'js'), { recursive: true });
        // Canonical changes under test, with the project's real plugin manifest and plugins.
        for (const rel of ['reactor_main.js', 'reactor_sprites.js', 'libs/pixi_compat.js']) {
            fs.copyFileSync(path.join(root, 'runtime', rel), path.join(project, 'js', rel));
        }
        for (const name of ['data', 'img', 'audio', 'fonts', 'effects', 'movies', 'css', 'icon', '3d']) {
            if (fs.existsSync(path.join(source, name))) fs.symlinkSync(path.join(source, name), path.join(project, name));
        }
        fs.copyFileSync(path.join(source, 'index.html'), path.join(project, 'index.html'));
        const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
        pkg.main = 'index.html';
        fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify(pkg));
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { args: [`nwapp=${project}`, `user-data-dir=${temp}/profile`, 'no-first-run'] } });
        await driver.waitForScript('return !!window.SceneManager?._scene && window.DataManager?.isDatabaseLoaded();', [], { timeout: 60000 });
        await driver.execute(`window.__buttonErrors=[];addEventListener('error',e=>__buttonErrors.push(String(e.error||e.message)));addEventListener('unhandledrejection',e=>__buttonErrors.push(String(e.reason)));
            ConfigManager.touchUI=true;
            const onLoad=DataManager.onLoad;DataManager.onLoad=function(data){onLoad.call(this,data);if(data===$dataMap)data.events=[null];};
            DataManager.setupNewGame();$gameSystem.enableMenu();SceneManager.goto(Scene_Map);`);
        await driver.waitForScript('return SceneManager._scene instanceof Scene_Map && SceneManager._scene._menuButton?.visible && !SceneManager.isSceneChanging();', [], { timeout: 30000 });
        await wait();
        console.log('Button visibility:', await driver.execute('return {visible:SceneManager._scene._menuButton.visible,worldVisible:SceneManager._scene._menuButton.worldVisible??null,pixi:PIXI.VERSION};'));
        await click('SceneManager._scene._menuButton');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_Menu && !SceneManager.isSceneChanging();');
        checks.push('mouse opens the menu');
        await wait(); await click('SceneManager._scene._cancelButton', true);
        await driver.waitForScript('return SceneManager._scene instanceof Scene_Map && !SceneManager.isSceneChanging();');
        checks.push('touch closes the menu');
        await wait(); await click('SceneManager._scene._menuButton', true);
        await driver.waitForScript('return SceneManager._scene instanceof Scene_Menu && !SceneManager.isSceneChanging();');
        checks.push('touch opens the menu');
        await wait(); await click('SceneManager._scene._cancelButton');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_Map && !SceneManager.isSceneChanging();');
        checks.push('mouse closes the menu');
        await driver.execute(`window.__shopItem=$dataItems.find(item=>item&&item.id>0&&item.name);$gameParty.gainGold(10000);window.__shopBefore=$gameParty.numItems(__shopItem);window.__goldBefore=$gameParty.gold();SceneManager.push(Scene_Shop);SceneManager.prepareNextScene([[0,__shopItem.id,1,10]],false);`);
        await driver.waitForScript('return SceneManager._scene instanceof Scene_Shop && SceneManager._scene._buyWindow && !SceneManager.isSceneChanging();');
        await driver.execute('const s=SceneManager._scene;s.commandBuy();s._buyWindow.select(0);s.onBuyOk();');
        await wait();
        for (const [index, number, touch] of [[2,2,false],[3,12,true],[0,2,false],[1,1,true]]) {
            await click(`SceneManager._scene._numberWindow._buttons[${index}]`, touch);
            assert.equal(await driver.execute('return SceneManager._scene._numberWindow.number();'), number);
            checks.push(`shop quantity button ${index} gives ${number} (${touch?'touch':'mouse'})`);
        }
        await click('SceneManager._scene._numberWindow._buttons[4]', true);
        const purchase = await driver.execute('return {items:$gameParty.numItems(__shopItem)-__shopBefore,gold:__goldBefore-$gameParty.gold(),active:SceneManager._scene._numberWindow.active,errors:__buttonErrors};');
        assert.equal(purchase.items, 1); assert.equal(purchase.gold, 10); assert.equal(purchase.active, false);
        assert.deepEqual(purchase.errors, []);
        checks.push('touch confirms exactly one purchase');
        console.log(JSON.stringify({ project: path.basename(source), checks, errors: purchase.errors }, null, 2));
    } finally {
        await driver.close();
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
