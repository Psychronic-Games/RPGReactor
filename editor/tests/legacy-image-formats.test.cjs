'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const Image=require('../src/legacy/LegacyImage.js'),{PNG}=require('../node_modules/pngjs');
function bmp(width,height,topDown=false){
 const stride=Math.ceil(width/4)*4,offset=54+256*4,b=Buffer.alloc(offset+stride*height);
 b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(offset,10);b.writeUInt32LE(40,14);b.writeInt32LE(width,18);b.writeInt32LE(topDown?-height:height,22);b.writeUInt16LE(1,26);b.writeUInt16LE(8,28);b.writeUInt32LE(256,46);
 for(let n=0;n<256;n++){b[offset-1024+n*4]=n;b[offset-1024+n*4+1]=2;b[offset-1024+n*4+2]=3;}
 // Two palette entries intentionally share RGB; transparency keys the index, not every matching color.
 b[54+4]=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)b[offset+(topDown?y:height-y-1)*stride+x]=(x+y)%3;
 return b;
}
function xyz(width,height){const palette=Buffer.alloc(768),pixels=Buffer.alloc(width*height);for(let n=0;n<256;n++){palette[n*3]=n;palette[n*3+1]=2;palette[n*3+2]=3;}palette[3]=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels[y*width+x]=(x+y)%3;const h=Buffer.alloc(8);h.write('XYZ1');h.writeUInt16LE(width,4);h.writeUInt16LE(height,6);return Buffer.concat([h,zlib.deflateSync(Buffer.concat([palette,pixels]))]);}

test('8-bit BMP handles row padding, bottom-up/top-down rows and palette-index transparency',()=>{
 for(const topDown of [false,true]){const image=Image.decode(bmp(3,2,topDown),true);assert.equal(image.width,3);assert.equal(image.height,2);assert.deepEqual([...image.data.slice(0,8)],[3,2,0,0,3,2,0,255]);assert.equal(image.data[11],255);assert.equal(image.data[12+3],255);assert.equal(Image.decode(bmp(3,2,topDown),false).data[3],255);}
});
test('XYZ zlib palette and pixels decode with per-call opacity, without a converter installation',()=>{
 const image=Image.decode(xyz(3,2),true);assert.deepEqual([...image.data.slice(0,8)],[0,2,3,0,0,2,3,255]);assert.equal(Image.decode(xyz(3,2),false).data[3],255);
});
test('malformed/oversized images fail with a bounded diagnostic before allocation',()=>{
 const b=bmp(3,2);b.writeInt32LE(0x7fffffff,18);assert.throws(()=>Image.decode(b),/oversized/);
 const truncated=bmp(3,2).subarray(0,60);assert.throws(()=>Image.decode(truncated),/Truncated/);
 const compressed=bmp(3,2);compressed.writeUInt32LE(1,30);assert.throws(()=>Image.decode(compressed),/Unsupported BMP encoding/);
 const h=Buffer.alloc(8);h.write('XYZ1');h.writeUInt16LE(1,4);h.writeUInt16LE(1,6);assert.throws(()=>Image.decode(Buffer.concat([h,zlib.deflateSync(Buffer.alloc(900))])));
 assert.throws(()=>Image.decode(Buffer.from('not an image')),/Unsupported legacy image/);
});

test('a real 2000 import converts BMP chipsets, XYZ sprites, nested opaque pictures and nested audio',async t=>{
 const original=path.resolve(__dirname,'../../template/Sunset over Imdahl');const names=fs.existsSync(original)?fs.readdirSync(original):[];const actual=n=>names.find(f=>f.toLowerCase()===n.toLowerCase());if(!actual('RPG_RT.ldb')){t.skip('Imdahl fixture absent');return;}
 const I=require('../src/legacy/LegacyImporter.js'),p=I.open(original).project;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-legacy-image-')),source=path.join(dir,'source'),dest=path.join(dir,'out');
 const write=(rel,data)=>{const file=path.join(source,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);};
 try{
  for(const file of ['RPG_RT.ldb','RPG_RT.lmt','Map0003.lmu'])write(file,fs.readFileSync(path.join(original,actual(file))));
  write('RPG_RT.ini','[RPG_RT]\nGameTitle=Legacy image fixture\nFullPackageFlag=1\nEncoding=1252\n');
  const chip=p.database.chipsets[p.maps[3].chipset_id];write('ChipSet/'+chip.chipset_name+'.BMP',bmp(480,256));
  write('Battle/Launch.png.png',require('../node_modules/pngjs').PNG.sync.write({width:96,height:96,data:Buffer.alloc(96*96*4,255)}));
  write('CharSet/Sub/Hero.xyz',xyz(288,256));write('Picture/Nested/Plate.xyz',xyz(3,2));write('Music/Sub/Fanfare.ogg.ogg',Buffer.from('audio fixture'));write('Sound/Sub/Hit.wav',Buffer.from('sound fixture'));write('Movie/Sub/Intro.avi.avi',Buffer.from('movie fixture'));
  // Patch one tiny event record into a real LMU so source names (including case/separators) exercise the full path.
  const ber=n=>{n>>>=0;const a=[n&127];for(n=Math.floor(n/128);n;n=Math.floor(n/128))a.unshift((n&127)|128);return Buffer.from(a);};
  const chunk=(id,b)=>Buffer.concat([ber(id),ber(b.length),b]);const s=(id,v)=>chunk(id,Buffer.from(v));const integer=(id,v)=>chunk(id,ber(v));
  const command=(code,params,text='')=>Buffer.concat([ber(code),ber(0),ber(Buffer.byteLength(text)),Buffer.from(text),ber(params.length),...params.map(ber)]);
  const record=(id,...cs)=>Buffer.concat([ber(id),...cs,Buffer.from([0])]);const array=(...rs)=>Buffer.concat([ber(rs.length),...rs]);
  const page=record(1,s(21,'Sub\\Hero'),chunk(52,Buffer.concat([command(11110,[1,0,0,0,0,100,0,0,100,100,100,100,0,0],'nested\\plate'),command(11510,[0,100,100,50],'sub\\fanfare'),command(0,[])])));
  const header=Buffer.concat([ber(10),Buffer.from('LcfMapUnit')]);const tiles=Buffer.alloc(4*4*2);for(let i=0;i<16;i++)tiles.writeUInt16LE(5000,i*2);
  write('Map0003.lmu',Buffer.concat([header,integer(1,chip.id),integer(2,4),integer(3,4),chunk(71,tiles),chunk(72,Buffer.alloc(tiles.length)),chunk(81,array(record(1,s(1,'Fixture'),chunk(5,array(page)))))]));
  const result=await I.importProject(source,dest,{maps:[3],noRtp:true,graphics:'original'});assert.equal(result.maps,1);
  const ts=JSON.parse(fs.readFileSync(path.join(dest,'data/Tilesets.json')))[chip.id];assert.ok(ts.tilesetNames.some(Boolean));
  assert.ok(fs.existsSync(path.join(dest,'img/animations/Launch.png')));assert.equal(fs.existsSync(path.join(dest,'img/animations/Launch.png.png')),false);
  assert.ok(fs.existsSync(path.join(dest,'img/characters/Sub/!Hero.png')));assert.ok(fs.existsSync(path.join(dest,'audio/bgm/Sub/Fanfare.ogg')));assert.ok(fs.existsSync(path.join(dest,'audio/se/Sub/Hit.wav')));assert.ok(fs.existsSync(path.join(dest,'movies/Sub/Intro.avi')));
  const picture=PNG.sync.read(fs.readFileSync(path.join(dest,'img/pictures/Nested/Plate.png')));assert.equal(picture.data[3],255,'opaque-only source picture preserves palette entry zero');
  const map=JSON.parse(fs.readFileSync(path.join(dest,'data/Map003.json')));assert.equal(map.events[1].pages[0].image.characterName,'Sub/!Hero');assert.equal(map.events[1].pages[0].list.find(c=>c.code===231).parameters[1],'Nested/Plate');
  assert.ok(!result.missingFiles.some(n=>/Sub\/|Nested\//i.test(n)));const runtime=fs.readFileSync(path.join(dest,'js/reactor_main.js'),'utf8');assert.equal(runtime,fs.readFileSync(path.resolve(__dirname,'../../runtime/reactor_main.js'),'utf8'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('JPEG preparation and nested MP4 conversion produce assets the runtime can load',async t=>{
 const {execFileSync}=require('node:child_process'),Media=require('../src/legacy/LegacyMedia.js');
 try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch(_){t.skip('FFmpeg unavailable');return;}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-import-media-formats-'));try{
  const movies=path.join(dir,'movies/Sub');fs.mkdirSync(movies,{recursive:true});const source=path.join(movies,'Intro.mp4');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=red:s=16x16:d=0.2','-c:v','mpeg4','-threads','2',source],{stdio:'pipe'});
  const jpeg=path.join(dir,'reference.jpg');execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',source,'-frames:v','1','-threads','2',jpeg],{stdio:'pipe'});
  const image=await Media.decodeImage(fs.readFileSync(jpeg),{ffmpegPath:'ffmpeg'});assert.equal(image.width,16);assert.equal(image.height,16);assert.ok(image.data[0]>200&&image.data[1]<30&&image.data[2]<30);
  const result=await Media.convertMovies(dir,{ffmpegPath:'ffmpeg'});assert.deepEqual(result.failed,[]);assert.deepEqual(result.converted,['Sub/Intro.mp4']);assert.equal(fs.existsSync(source),false);const bytes=fs.readFileSync(path.join(movies,'Intro.webm'));assert.deepEqual([...bytes.subarray(0,4)],[0x1a,0x45,0xdf,0xa3]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
