const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Json=require('../src/utils/JsonFiles.js');
const data={displayName:'Réacteur 日本語 🚀',note:'literal \ufeff stays',events:[null,{name:'灯',pages:[{list:[{code:401,parameters:['Hello 👋']}]}]}]},text=JSON.stringify(data);
function encode(text,encoding){
 if(encoding==='utf8')return Buffer.from(text);
 if(encoding==='utf8-bom')return Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(text)]);
 const bytes=Buffer.from('\ufeff'+text,'utf16le');return encoding==='utf16be'?bytes.swap16():bytes;
}
for(const encoding of ['utf8','utf8-bom','utf16le','utf16be'])test('JSON files decode '+encoding+' without changing authored Unicode',()=>{
 const bytes=encode(text,encoding);assert.deepEqual(Json.parse(bytes),data);
 const padded=Buffer.concat([Buffer.from([9,9,9]),bytes,Buffer.from([9])]);assert.deepEqual(Json.parse(padded.subarray(3,-1)),data);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-json-'));
 try{const file=path.join(temp,'Map001.json');fs.writeFileSync(file,bytes);assert.deepEqual(Json.read(fs,file),data);assert.deepEqual(fs.readFileSync(file),bytes);}finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('decoded XHR text strips only the leading BOM, and malformed input still throws',()=>{
 assert.deepEqual(Json.parse('\ufeff'+text),data);
 for(const value of ['\ufeff{bad',Buffer.from([0xff,0xfe,0x7b]),Buffer.from([0xef,0xbb,0xbf,0xc3,0x28])])assert.throws(()=>Json.parse(value));
 assert.throws(()=>Json.read({readFileSync(){throw Error('unreadable');}},'map'),/unreadable/);
});
test('the editor and runtime use identical decoding rules',()=>{
 assert.equal(fs.readFileSync(path.join(__dirname,'../src/utils/JsonFiles.js'),'utf8'),fs.readFileSync(path.join(__dirname,'../../runtime/reactor_json.js'),'utf8'));
});
module.exports={encode};

test('data files are written readable and compact: a record a line, the way RPG Maker writes a database', () => {
    const J = require(path.join(__dirname, '../src/utils/JsonFiles.js'));
    const actors = [null, { id: 1, name: 'Hero', traits: [{ code: 1 }] }, { id: 2, name: 'Mage' }];
    assert.equal(J.stringify(actors), '[\nnull,\n{"id":1,"name":"Hero","traits":[{"code":1}]},\n{"id":2,"name":"Mage"}\n]');
    const system = { gameTitle: 'Demo', sounds: [{ name: 'Cursor1' }, { name: 'Decision1' }], size: [816, 624] };
    assert.equal(J.stringify(system), '{\n  "gameTitle": "Demo",\n  "sounds": [\n    {"name":"Cursor1"},\n    {"name":"Decision1"}\n  ],\n  "size": [816,624]\n}');
    for (const value of [actors, system, [], {}, [1, 2], 'x']) assert.deepEqual(JSON.parse(J.stringify(value)), value);
    const manager = fs.readFileSync(path.join(__dirname, '../src/DatabaseManager.js'), 'utf8');
    assert.match(manager, /RRJson\.stringify\(this\.fileContent\(filename, data\)\)/);
});
