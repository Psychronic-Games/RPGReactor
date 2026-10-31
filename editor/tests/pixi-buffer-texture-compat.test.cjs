'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), test = require('node:test'), vm = require('node:vm');
const native = require('pixi.js');
const compat = fs.readFileSync(path.resolve(__dirname,'../../runtime/libs/pixi_compat.js'),'utf8');
function load(overrides={}) {
    const PIXI={...native,...overrides};
    const context={PIXI,Float32Array,Uint8Array,ArrayBuffer,console:{log(){},warn(){},error(){}},window:{location:{search:''}}};
    vm.runInNewContext(compat,context);return {PIXI,context};
}

test('legacy buffer factories retain RGBA byte data and map sampling options onto a real Pixi source',()=>{
    const {PIXI:P}=load(),bytes=new Uint8Array([255,0,0,255,0,255,0,128]);
    const options={scaleMode:1,wrapMode:10497,mipmap:false};
    const t=P.Texture.fromBuffer(bytes,2,1,options);
    assert.equal(t.source instanceof P.BufferImageSource,true);
    assert.equal(t.source.resource===bytes,true,'the original array stays live without copying');
    assert.equal(t.baseTexture.resource.data===bytes,true);
    assert.equal(t.source.format,'rgba8unorm');assert.equal(t.source.alphaMode,'no-premultiply-alpha');
    assert.equal(t.source.scaleMode,'linear');assert.equal(t.source.addressMode,'repeat');assert.equal(t.source.autoGenerateMipmaps,false);
    assert.deepEqual([t.width,t.height],[2,1]);assert.deepEqual(options,{scaleMode:1,wrapMode:10497,mipmap:false});
    t.baseTexture.wrapMode=P.WRAP_MODES.MIRRORED_REPEAT;assert.equal(t.source.addressMode,'mirror-repeat');
    let updates=0;t.source.on('update',()=>updates++);bytes[0]=32;t.baseTexture.resource.update();assert.equal(updates,1);assert.equal(t.source.resource[0],32);
    const source=t.source;t.destroy(true);assert.equal(source.destroyed,true);
});

test('float data and omitted data use float RGBA sources with legacy nearest defaults',()=>{
    const {PIXI:P}=load(),data=new Float32Array([1,0.5,0,1]);
    const t=P.Texture.fromBuffer(data,1,1);assert.equal(t.source.resource===data,true);assert.equal(t.source.format,'rgba32float');assert.equal(t.source.scaleMode,'nearest');
    const base=P.BaseTexture.fromBuffer(null,2,2);
    assert.equal(base.resource.data instanceof Float32Array,true);assert.equal(base.resource.data.length,16);
    assert.equal(base.source.format,'rgba32float');assert.equal(base.valid,true);
    const texture=new P.Texture(base);assert.equal(texture.source===base.source,true);assert.deepEqual([texture.width,texture.height],[2,2]);
    base.destroy();assert.equal(texture.source.destroyed,true);texture.destroy();t.destroy(true);
});

test('base textures adopt buffer sources without creating a canvas and can upload and release them',()=>{
    const {PIXI:P,context}=load();context.document={createElement(){throw Error('buffer texture must not allocate a canvas');}};
    const base=P.BaseTexture.fromBuffer(new Uint8Array(64),4,4,{resolution:2,alphaMode:2,scaleMode:0});
    assert.deepEqual([base.width,base.height,base.source.pixelWidth,base.source.pixelHeight],[2,2,4,4]);
    assert.equal(base.source.alphaMode,'premultiplied-alpha');let updates=0;base.source.on('update',()=>updates++);
    base.update();P.__reactorFlushTextureUploads();assert.equal(updates,1);
    // A BaseTexture update is deferred until rendering, just like other legacy bitmaps.
    const source=base.source;assert.equal(source.resource===base.resource.data,true);base.destroy();assert.equal(source.destroyed,true);assert.equal(base.valid,false);
});

test('installing compatibility twice preserves installed factories and existing legacy implementations',()=>{
    const {PIXI:P,context}=load();const from=P.Texture.fromBuffer,base=P.BaseTexture.fromBuffer;
    vm.runInNewContext(compat,context);assert.equal(P.Texture.fromBuffer,from);assert.equal(P.BaseTexture.fromBuffer,base);
    const legacy={...native,Texture:class Texture{},BaseTexture:class BaseTexture{}};
    legacy.Texture.fromBuffer=()=>1;legacy.BaseTexture.fromBuffer=()=>2;
    vm.runInNewContext(compat,{PIXI:legacy,console:{log(){},warn(){},error(){}},window:{location:{search:''}}});
    assert.equal(legacy.Texture.fromBuffer(),1);assert.equal(legacy.BaseTexture.fromBuffer(),2);
});


test('GL uploads use physical buffer dimensions without changing logical size or other native sources',()=>{
    let seen;
    const upload={upload(source,texture,gl){seen={source,texture,gl,width:source.width,height:source.height};}};
    const {PIXI:P}=load({glUploadBufferImageResource:upload});
    const base=P.BaseTexture.fromBuffer(new Uint8Array(128),8,4,{resolution:2}),texture={},gl={};
    upload.upload(base.source,texture,gl);
    assert.deepEqual([seen.width,seen.height],[8,4]);assert.deepEqual([base.source.width,base.source.height],[4,2]);
    assert.equal(seen.source.resource===base.resource.data,true);assert.equal(seen.texture,texture);assert.equal(seen.gl,gl);
    const modern=new P.BufferImageSource({width:4,height:2,resolution:2,resource:new Uint8Array(128)});
    upload.upload(modern,texture,gl);assert.equal(seen.source===modern,true,'unrelated v8 sources keep the native path');
    modern.destroy();base.destroy();
});
