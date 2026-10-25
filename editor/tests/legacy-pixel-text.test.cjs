'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {runtimeSource}=require('./helpers/runtime-source.cjs');
function setup(){
    const source=runtimeSource('reactor_core.js');
    const pick=name=>{const a=source.indexOf(name+' = function');assert.ok(a>=0);return source.slice(a,source.indexOf('\n};',a)+3);};
    function Bitmap(){}
    let allocations=0,rasters=0,ready=true;
    const canvases=[];
    const document={fonts:{check:()=>ready},createElement(){allocations++;let pixels;const ink={
        fillText(){rasters++;},getImageData(){return {data:new Uint8ClampedArray([255,255,255,64,255,255,255,127,255,255,255,128,255,255,255,254,255,255,255,255])};},
        putImageData(p){pixels=Array.from(p.data);},fillRect(){},get pixels(){return pixels;}
    };const c={width:0,height:0,getContext:()=>ink,ink};canvases.push(c);return c;}};
    const sandbox={Bitmap,document,$dataSystem:{rrLegacyWindows:2000,advanced:{pixelatedRendering:true,fontSize:12}}};
    vm.runInNewContext([pick('Bitmap.pixelText'),pick('Bitmap.fixedFontSize'),pick('Bitmap.prototype._drawLegacyPixelText')].join('\n'),sandbox);
    const calls=[];
    const context={textAlign:'left',measureText:t=>({width:String(t).length*6.25}),save(){calls.push(['save']);},restore(){calls.push(['restore']);},drawImage(c,x,y){calls.push(['image',c,x,y,this.globalAlpha]);},globalAlpha:.4};
    const bitmap=Object.assign(new Bitmap(),{_drawingContext:()=>context,_makeFontNameText:()=> '12px test'});
    return {Bitmap,bitmap,context,calls,canvases,sandbox,setReady:v=>{ready=v;},counts:()=>({allocations,rasters})};
}
test('legacy pixel text thresholds native glyph coverage, snaps its mask and preserves drawing opacity',()=>{
    const s=setup();assert.equal(s.bitmap._drawLegacyPixelText('Test',2.4,13.1,'#ffffff'),true);
    assert.deepEqual(s.canvases[0].ink.pixels.filter((_,i)=>i%4===3),[0,0,255,255,255]);
    assert.equal(s.canvases[0].ink.globalCompositeOperation,'source-in','color is applied after coverage, preserving a translucent text color');
    assert.deepEqual(s.calls.find(c=>c[0]==='image').slice(2),[-10,-11,.4]);
    s.bitmap._drawLegacyPixelText('Test',2,13,'#ffffff');assert.equal(s.counts().rasters,1,'same font, text and color reuse the mask');
    s.context.textAlign='right';s.bitmap._drawLegacyPixelText('Test',30,13,'#ffffff');assert.equal(s.calls.filter(c=>c[0]==='image').at(-1)[2],-7,'right alignment still uses the natural advance');
});
test('modern text and smoothing-enabled legacy text keep the ordinary canvas rasterizer',()=>{
    const s=setup();s.sandbox.$dataSystem={advanced:{fontSize:12,pixelatedRendering:true}};
    assert.equal(s.bitmap._drawLegacyPixelText('A',0,12,'white'),false);
    s.sandbox.$dataSystem={rrLegacyWindows:2003,advanced:{fontSize:12,pixelatedRendering:false}};
    assert.equal(s.bitmap._drawLegacyPixelText('A',0,12,'white'),false);assert.equal(s.counts().allocations,0);
});
test('pixel text cache is bounded and does not retain a temporary font fallback',()=>{
    const s=setup();s.setReady(false);s.bitmap._drawLegacyPixelText('loading',0,12,'white');s.bitmap._drawLegacyPixelText('loading',0,12,'white');
    assert.equal(s.Bitmap._legacyPixelTextCache.size,0);s.setReady(true);
    for(let i=0;i<300;i++)s.bitmap._drawLegacyPixelText('line'+i,0,12,'white');
    assert.ok(s.Bitmap._legacyPixelTextCache.size<=128);assert.ok(s.Bitmap._legacyPixelTextPixels<=1048576);
    assert.equal(s.bitmap._drawLegacyPixelText('a'.repeat(2000),0,12,'white'),false,'oversized plugin strings do not allocate an unbounded canvas');
});

test('an explicitly disabled outline never calls canvas strokeText',()=>{
    function Bitmap(){};const source=runtimeSource('reactor_core.js');const a=source.indexOf('Bitmap.prototype._drawTextOutline = function');
    vm.runInNewContext(source.slice(a,source.indexOf('\n};',a)+3),{Bitmap});
    const b=Object.assign(new Bitmap(),{outlineWidth:0,_drawingContext(){throw new Error('zero-width outline should not draw');}});
    b._drawTextOutline('Text',0,12,100);
});

test('legacy dialogue starts at its eight-pixel window padding without MZ extra inset',()=>{
    const src=runtimeSource('reactor_windows.js'),start=src.indexOf('Window_Message.prototype.newLineX = function');
    function Window_Message(){};let face='';const box={Window_Message,$gameMessage:{faceName:()=>face},ImageManager:{faceWidth:144},$dataSystem:{rrLegacyWindows:2000}};
    vm.runInNewContext(src.slice(start,src.indexOf('\n};',start)+3),box);
    const w=Object.assign(new Window_Message(),{innerWidth:304});
    assert.equal(8+w.newLineX({rtl:false}),8);assert.equal(w.newLineX({rtl:true}),304);
    box.$dataSystem.rrLegacyWindows=2003;assert.equal(w.newLineX({rtl:false}),0);
    box.$dataSystem={};assert.equal(w.newLineX({rtl:false}),4);assert.equal(w.newLineX({rtl:true}),300);
    face='Portrait';assert.equal(w.newLineX({rtl:false}),164,'face spacing stays on its existing path');
});
