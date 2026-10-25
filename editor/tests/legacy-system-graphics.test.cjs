'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {runtimeSource}=require('./helpers/runtime-source.cjs');
const C=require('../src/legacy/LegacyCommands.js'),K=require('../src/legacy/LegacyConvert.js'),I=require('../src/legacy/LegacyImporter.js');
function pick(source,name){const a=source.indexOf(name+' = function');assert.ok(a>=0,name);return source.slice(a,source.indexOf('\n};',a)+3);}
test('Change System Graphics becomes an executable command with the original stretch/font settings',()=>{
    const out=C.convertList([{code:10680,indent:2,string:'SaveMeny.png',parameters:[1,0]}],{actors:[],notes:{}});
    assert.equal(out.list[0].code,355);assert.equal(out.list[0].indent,2);assert.equal(out.list[0].parameters[0],'this.rrSystemGraphic("SaveMeny", 1, 0)');
});
test('dynamic skin selection survives save serialization, changes palette and respects name case',()=>{
    function Game_System(){};function Game_Interpreter(){};
    const sys={rrLegacyWindows:2000,rrLegacyWindowStretch:1,rrLegacySkins:{system:'Window',savemeny:'RR2kWindow_1'}};
    const requested=[];const sandbox={Game_System,Game_Interpreter,$dataSystem:sys,$gameSystem:new Game_System(),ColorManager:{loadWindowskin(){requested.push(sandbox.$gameSystem.windowSkinName());}}};
    let legacy=runtimeSource('reactor_objects.js');const a=legacy.indexOf('    Game_Interpreter.prototype.rrSystemGraphic = function');const b=legacy.indexOf('\n    };',a);
    vm.runInNewContext([pick(legacy,'Game_System.prototype.windowSkinName'),pick(legacy,'Game_System.prototype.windowBackgroundMode'),legacy.slice(a,b+7)].join('\n'),sandbox);
    const it=new Game_Interpreter();assert.equal(sandbox.$gameSystem.windowSkinName(),'Window');assert.equal(sandbox.$gameSystem.windowBackgroundMode(),1);
    it.rrSystemGraphic('sAVEmEnY.png',0,1);assert.equal(sandbox.$gameSystem.windowSkinName(),'RR2kWindow_1');assert.equal(sandbox.$gameSystem.windowBackgroundMode(),0);
    sandbox.$gameSystem=Object.assign(new Game_System(),JSON.parse(JSON.stringify(sandbox.$gameSystem)));assert.equal(sandbox.$gameSystem.windowSkinName(),'RR2kWindow_1');
    it.rrSystemGraphic('missing',1,0);assert.deepEqual(requested,['RR2kWindow_1'],'missing art does not start an endless failed image load');
    it.rrSystemGraphic('System',1,0);assert.equal(sandbox.$gameSystem.windowSkinName(),'Window');assert.equal(sandbox.$gameSystem.windowBackgroundMode(),1);
    sandbox.ColorManager._windowskin={isReady:()=>false};it.setWaitMode=mode=>{it.wait=mode;};it.rrSystemGraphic('SaveMeny',0,0);assert.equal(it.wait,'image','the following message waits for its palette image');
});
test('legacy skin conversion removes the stock background overlay and preserves a native tile',()=>{
    const skin=K.blank(160,80),base=K.blank(192,192);base.data.fill(255);
    for(let y=0;y<32;y++)for(let x=0;x<32;x++)skin.data.set([x,y,70,255],(y*160+x)*4);
    const out=K.windowSkin(skin,base),px=(x,y)=>Array.from(out.data.slice((y*192+x)*4,(y*192+x)*4+4));
    assert.deepEqual(px(17,96+20),[17,20,70,255]);assert.deepEqual(px(60,110),[0,0,0,0]);
});
test('legacy windows use their own stretched or native tiled background, with finite closed geometry',()=>{
    function Window(){};const obj={Window,$dataSystem:{rrLegacyWindows:2000,rrLegacySkins:{}},$gameSystem:{windowBackgroundMode:()=>mode}};let mode=0;
    vm.runInNewContext(pick(runtimeSource('reactor_core.js'),'Window.prototype._refreshBack'),obj);
    const sprite=()=>({children:[],scale:{},move(...v){this.position=v;},setFrame(...v){this.frame=v;},setColorTone(){}});
    const back=sprite(),tile=sprite();back.children=[tile];const window=Object.assign(new Window(),{_margin:0,_width:320,_height:80,_backSprite:back,_windowskin:{}});
    window._refreshBack();assert.equal(tile.visible,false);assert.deepEqual(back.frame,[0,0,96,96]);
    mode=1;window._refreshBack();assert.equal(tile.visible,true);assert.deepEqual(tile.frame,[0,96,32,32]);assert.equal(back.scale.x,1);assert.equal(tile.scale.x,1);
    window._width=window._height=0;window._refreshBack();assert.equal(tile.visible,false);assert.ok(Number.isFinite(tile.scale.x));
});

test('an active window redraws with the newly loaded palette and ignores stale/destroyed listeners',()=>{
    function Window_Base(){};let selected='Window',refreshes=0,resets=0;
    const listeners={};const skins={};for(const name of ['Window','Other'])skins[name]={addLoadListener(fn){(listeners[name]||=[]).push(fn);}};
    const sandbox={Window_Base,$dataSystem:{rrLegacyWindows:2000},$gameSystem:{windowSkinName:()=>selected,windowBackgroundMode:()=>0},ImageManager:{loadSystem:name=>skins[name]},ColorManager:{loadWindowskin(){this._windowskin=skins[selected];}}};
    vm.runInNewContext(pick(runtimeSource('reactor_windows.js'),'Window_Base.prototype.loadWindowskin'),sandbox);
    const w=Object.assign(new Window_Base(),{contents:{},refresh(){refreshes++;},resetFontSettings(){resets++;}});
    w.loadWindowskin();selected='Other';w.loadWindowskin();listeners.Window[0]();assert.equal(refreshes,0,'a slow old skin cannot repaint a newer selection');
    listeners.Other[0]();assert.equal(refreshes,1);assert.equal(resets,1);assert.equal(sandbox.ColorManager._windowskin,skins.Other);
    w.destroyed=true;listeners.Other[0]();assert.equal(refreshes,1);
});
const sunset=path.resolve(__dirname,'../../template/Sunset over Imdahl');
test('a real Sunset import carries initial and event-selected window artwork and executable switches',{skip:!fs.existsSync(path.join(sunset,'RPG_RT.LDB'))},async()=>{
    const dest=fs.mkdtempSync(path.join(os.tmpdir(),'rr-legacy-skins-'));
    try{
        await I.importProject(sunset,dest,{maps:[1,11,35],force:true});
        const system=JSON.parse(fs.readFileSync(path.join(dest,'data/System.json')));
        assert.equal(system.rrLegacySkins.system,'Window');assert.ok(system.rrLegacySkins.savemeny);
        assert.ok(fs.existsSync(path.join(dest,'img/system',system.rrLegacySkins.savemeny+'.png')));
        const map=JSON.parse(fs.readFileSync(path.join(dest,'data/Map011.json')));
        assert.ok(JSON.stringify(map).includes('this.rrSystemGraphic(\\"SaveMeny\\", 0, 0)'));
        const {PNG}=require('pngjs');const p=PNG.sync.read(fs.readFileSync(path.join(dest,'img/system',system.rrLegacySkins.savemeny+'.png')));
        assert.deepEqual(Array.from(p.data.slice(0,4)),[174,155,134,255],'the custom menu keeps its brown background, instead of the initial white skin');
        const fonts=path.resolve(__dirname,'../../template/DEEP 8/fonts');
        if(fs.existsSync(path.join(fonts,'RMG2000.fon'))){
            await I.importProject(sunset,dest,{maps:[1],force:true,skipAssets:true,fontPath:fonts});
            const gothic=JSON.parse(fs.readFileSync(path.join(dest,'data/System.json')));
            assert.equal(gothic.advanced.mainFontFilename,'RMG2000.ttf','an omitted font_id has the original Gothic default, rather than preferring Mincho');
        }
    }finally{fs.rmSync(dest,{recursive:true,force:true});}
});
