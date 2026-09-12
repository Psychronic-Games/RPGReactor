const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, 'runtime', file), 'utf8');
function method(source, name) {
    const escaped = name.replaceAll('.', '\\.');
    const match = source.match(new RegExp(escaped + ' = function\\([^]*?\\n};'));
    assert.ok(match, name);
    return match[0];
}
function world({tile=16,zoom=1,x=0,y=0,width=200,height=200,loop=false,three=false}={}) {
    const objects=read('reactor_objects.js'), sprites=read('reactor_sprites.js');
    const context={Game_Map:function(){},Game_Player:function(){},Spriteset_Map:function(){},Graphics:{width:816,height:624},
        $dataSystem:{advanced:{camera2DZoom:zoom,camera2DOffsetX:x,camera2DOffsetY:y}},$dataMap:{width,height,three},
        Reactor3D:{isMap3D:data=>data.three},$gameScreen:{zoomScale:()=>1,zoomX:()=>0,zoomY:()=>0,shake:()=>0}};
    vm.createContext(context);
    vm.runInContext('Number.prototype.clamp=function(a,b){return Math.min(Math.max(this,a),b);};Number.prototype.mod=function(n){return (this%n+n)%n;};',context);
    const mapNames=['reactorCameraZoom','reactorCameraOffset','reactorCanvasToWorld','screenTileX','screenTileY','setDisplayPos','canvasToMapX','canvasToMapY','adjustX','adjustY','roundX','roundY','scrollLeft','scrollRight','scrollUp','scrollDown'];
    const playerNames=['centerX','centerY','center','updateScroll'];
    vm.runInContext(mapNames.map(n=>method(objects,'Game_Map.prototype.'+n)).concat(playerNames.map(n=>method(objects,'Game_Player.prototype.'+n)),method(sprites,'Spriteset_Map.prototype.updateReactor2DCamera')).join('\n'),context);
    const map=context.$gameMap=new context.Game_Map();
    Object.assign(map,{_displayX:0,_displayY:0,_parallaxX:0,_parallaxY:0,width:()=>width,height:()=>height,tileWidth:()=>tile,tileHeight:()=>tile,isLoopHorizontal:()=>loop,isLoopVertical:()=>loop});
    const player=context.$gamePlayer=new context.Game_Player();
    Object.assign(player,{_realX:100,_realY:100,scrolledX(){return map.adjustX(this._realX);},scrolledY(){return map.adjustY(this._realY);}});
    const part=()=>({scale:{x:1,y:1,set(x,y){this.x=x;this.y=y;}}});
    const makeSprites=()=>Object.assign(new context.Spriteset_Map(),{_baseSprite:part(),_weather:part(),_pictureContainer:part(),_timerSprite:part()});
    return {context,map,player,makeSprites,settings:context.$dataSystem.advanced};
}
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,`${message}: ${actual} != ${expected}`);

test('camera defaults preserve ordinary map spans and save scroll positions',()=>{
    const w=world();delete w.settings.camera2DZoom;delete w.settings.camera2DOffsetX;delete w.settings.camera2DOffsetY;
    assert.equal(w.map.screenTileX(),51);assert.equal(w.map.screenTileY(),39);
    w.map.setDisplayPos(15,20);w.makeSprites().updateReactor2DCamera();
    assert.equal(w.map._displayX,15);assert.equal(w.map._displayY,20);
});

test('zoom and offsets frame the player cell consistently at every supported tile size',()=>{
    for(const tile of [8,16,24,32,48,64]) for(const zoom of [1,1.5,2,4,8]) {
        const w=world({tile,zoom,x:40,y:48});w.player.center(100,100);
        near((100-w.map._displayX+.5)*tile*zoom,408+40,`${tile}px zoom ${zoom} X`);
        near((100-w.map._displayY+.5)*tile*zoom,312+48,`${tile}px zoom ${zoom} Y`);
        const sprites=w.makeSprites();sprites.updateReactor2DCamera();
        assert.equal(sprites._baseSprite.scale.x,zoom);assert.equal(sprites._weather.scale.x,zoom);
        assert.equal(sprites._pictureContainer.scale.x,1);assert.equal(sprites._timerSprite.scale.x,1);
    }
});

test('camera bounds use the visible zoomed area and center maps smaller than it',()=>{
    const w=world({tile:32,zoom:2.5,x:30,y:-50,width:100,height:80});
    w.player.center(0,0);assert.equal(w.map._displayX,0);assert.equal(w.map._displayY,0);
    w.player.center(99,79);
    near(w.map._displayX,100-816/80,'right edge');near(w.map._displayY,80-624/80,'bottom edge');
    const small=world({tile:8,zoom:4,width:4,height:3,x:100,y:100});small.player.center(2,1);
    near(small.map._displayX,(4-816/32)/2,'small map X');near(small.map._displayY,(3-624/32)/2,'small map Y');
});

test('tracking retains the offset after movement in each direction',()=>{
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const w=world({zoom:3,x:-60,y:72});w.player.center(100,100);
        const oldX=w.player.scrolledX(),oldY=w.player.scrolledY();w.player._realX+=dx;w.player._realY+=dy;w.player.updateScroll(oldX,oldY);
        near((w.player.scrolledX()+.5)*16*3,348,'follow X');near((w.player.scrolledY()+.5)*16*3,384,'follow Y');
    }
});

test('screen picking reverses map zoom, event zoom, shake and loop seams',()=>{
    for(const loop of [false,true]) {
        const w=world({tile:16,zoom:2.5,width:40,height:40,loop,x:36,y:-48});
        w.context.$gameScreen={zoomScale:()=>1.4,zoomX:()=>200,zoomY:()=>150,shake:()=>3.4};
        w.player.center(loop?39:20,loop?39:20);
        for(const [x,y] of (loop?[[39,39],[0,0],[1,1]]:[[19,18],[20,20],[22,23]])) {
            const sx=(w.map.adjustX(x)+.5)*16*2.5*1.4+Math.round(-200*.4)+3;
            const sy=(w.map.adjustY(y)+.5)*16*2.5*1.4+Math.round(-150*.4);
            assert.equal(w.map.canvasToMapX(sx),x);assert.equal(w.map.canvasToMapY(sy),y);
        }
    }
});

test('invalid framing is bounded and 3D maps retain their own projection',()=>{
    const w=world({zoom:Infinity,x:NaN,y:Infinity});assert.equal(w.map.reactorCameraZoom(),1);assert.equal(w.map.reactorCameraOffset('x'),0);
    w.settings.camera2DZoom=100;assert.equal(w.map.reactorCameraZoom(),8);
    w.settings.camera2DZoom=-2;assert.equal(w.map.reactorCameraZoom(),1);
    w.settings.camera2DOffsetY=100000;assert.equal(w.player.centerY(),w.map.screenTileY()-1);
    w.settings.camera2DZoom=4;w.context.$dataMap.three=true;
    assert.equal(w.map.reactorCameraZoom(),1);assert.equal(w.map.reactorCameraOffset('y'),0);assert.equal(w.map.screenTileX(),51);
});

test('changing settings reframes once; reopening a menu or restoring saved state preserves scroll',()=>{
    const w=world();const sprites=w.makeSprites();sprites.updateReactor2DCamera();
    let centers=0;const center=w.player.center;w.player.center=function(...args){centers++;return center.apply(this,args);};
    w.settings.camera2DZoom=2;sprites.updateReactor2DCamera();assert.equal(centers,1);
    w.map.setDisplayPos(12,15);w.makeSprites().updateReactor2DCamera();assert.equal(centers,1);assert.equal(w.map._displayX,12);
    w.map._reactorCamera2DState=JSON.parse(JSON.stringify(w.map._reactorCamera2DState));w.makeSprites().updateReactor2DCamera();assert.equal(centers,1);
    w.settings.camera2DOffsetY=30;sprites.updateReactor2DCamera();assert.equal(centers,2);
});


test('disabled camera preserves plugin transforms and the legacy input contract',()=>{
    const w=world(),s=w.makeSprites();s._baseSprite.scale.set(1.5,1.5);s._weather.scale.set(1.25,1.25);
    w.context.$gameScreen={zoomScale:()=>2,zoomX:()=>100,zoomY:()=>100,shake:()=>5};
    s.updateReactor2DCamera();assert.equal(s._baseSprite.scale.x,1.5);assert.equal(s._weather.scale.x,1.25);
    assert.equal(w.map.reactorCanvasToWorld(200,'x'),200);
    w.settings.camera2DZoom=2;s.updateReactor2DCamera();assert.equal(s._baseSprite.scale.x,2);
    w.settings.camera2DZoom=1;s.updateReactor2DCamera();assert.equal(s._baseSprite.scale.x,1);assert.equal(s._weather.scale.x,1);
});
