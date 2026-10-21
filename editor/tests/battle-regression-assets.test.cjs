const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const root=path.resolve(__dirname,'../..');
function audio(dir){
 const core=runtimeSource('reactor_core.js'),managers=fs.readFileSync(path.join(root,'runtime/reactor_managers.js'),'utf8'),warnings=[],created=[];
 const context={require,process:{mainModule:{filename:path.join(dir,'index.html')}},console:{warn:m=>warnings.push(m)},window:{},navigator:{userAgent:''},Graphics:{frameCount:1}};
 vm.runInNewContext(core.slice(core.indexOf('function Utils()'),core.indexOf('function Graphics()')),context);
 context.Utils.isNwjs=()=>true;context.Utils.hasEncryptedAudio=()=>false;
 context.AudioManager={_path:'audio/',_seBuffers:[],resolveSeVariant:se=>se,audioFileExt:()=>'.ogg',updateSeParameters(){},cleanupSe(){},createBuffer(folder,name){created.push(name);return {name,frameCount:context.Graphics.frameCount,play(){}};}};
 vm.runInNewContext(managers.slice(managers.indexOf('AudioManager.playSe ='),managers.indexOf('AudioManager.updateSeParameters =')),context);
 return {...context,warnings,created};
}
test('missing local SE skips repeated requests, warns once and recovers when the actual file is added',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-missing-se-'));try{
 const c=audio(dir);for(let i=0;i<40;i++){c.Graphics.frameCount++;c.AudioManager.playSe({name:'Blow1'});}assert.deepEqual(c.created,[]);assert.equal(c.warnings.length,1);assert.match(c.warnings[0],/audio\/se\/Blow1.ogg/);
 fs.mkdirSync(path.join(dir,'audio/se'),{recursive:true});fs.writeFileSync(path.join(dir,'audio/se/Blow1.WAV'),'actual-file');c.AudioManager.playSe({name:'Blow1'});assert.deepEqual(c.created,['Blow1']);assert.equal(c.AudioManager._missingSeWarnings.size,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('SE preflight recognizes encrypted alternate formats and leaves web and remote loaders in charge',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-missing-se-'));try{
 const c=audio(dir);fs.mkdirSync(path.join(dir,'audio/se'),{recursive:true});fs.writeFileSync(path.join(dir,'audio/se/Impact Sound.mp3_'),'encrypted');c.Utils.hasEncryptedAudio=()=>true;assert.equal(c.AudioManager.isMissingLocalSe('Impact Sound'),false);
 c.AudioManager._path='https://assets.example/';assert.equal(c.AudioManager.isMissingLocalSe('Missing'),false);c.AudioManager._path='audio/';c.Utils.isNwjs=()=>false;c.AudioManager.playSe({name:'Remote'});assert.deepEqual(c.created,['Remote']);assert.deepEqual(c.warnings,[]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
