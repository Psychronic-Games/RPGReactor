'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),bundlePath=path.join(root,'runtime/libs/three.js');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'editor/package.json'))),upstream=JSON.parse(fs.readFileSync(path.join(root,'editor/node_modules/three/package.json')));
const source=fs.readFileSync(bundlePath,'utf8');
function browserThree(clock=performance){const context=vm.createContext({console,performance:clock});vm.runInContext(source,context,{filename:'three.js'});return context.THREE;}
test('editor dependency, lockfile, offline browser bundle and Demo use the pinned stable Three.js release',()=>{
 assert.equal(pkg.dependencies.three,'0.187.0');assert.equal(upstream.version,pkg.dependencies.three);
 const lock=JSON.parse(fs.readFileSync(path.join(root,'editor/package-lock.json')));assert.equal(lock.packages['node_modules/three'].version,pkg.dependencies.three);assert.equal(lock.packages[''].dependencies.three,pkg.dependencies.three);
 const T=browserThree();assert.equal(T.REVISION,'187');assert.ok(fs.readFileSync(path.join(root,'template/Demo/js/libs/three.js')).equals(Buffer.from(source)),'Demo uses the identical browser library');
});
test('classic script boots without Node, require, imports or a network and preserves public constructors',async()=>{
 const T=browserThree(),npm=await import('three');assert.equal(Object.getOwnPropertyDescriptor(T,'Mesh').writable,true,'classic-script globals retain the writable namespace used by plugins');for(const name of ['WebGLRenderer','Mesh','SkinnedMesh','CubeCamera','PMREMGenerator','Timer','TextureSource'])assert.equal(typeof T[name],'function',name);
 for(const name of ['Mesh','SkinnedMesh','PerspectiveCamera','MeshPhysicalMaterial'])assert.equal(T[name].name,npm[name].name,'public constructor name '+name);
 const geometry=new T.BoxGeometry(),mesh=new T.Mesh(geometry,new T.MeshPhysicalMaterial({metalness:1,roughness:.12}));mesh.updateMatrixWorld(true);assert.equal(mesh.material.metalness,1);assert.ok(new T.Box3().setFromObject(mesh).getSize(new T.Vector3()).length()>0);geometry.dispose();mesh.material.dispose();
});
test('vendored browser output reproduces exactly from pinned upstream modules and bundler',()=>{
 const {contents}=require('../build-scripts/vendor-three.js').bundleThree();assert.ok(Buffer.from(contents).equals(Buffer.from(source)),'regenerate runtime/libs/three.js after changing its build inputs');
});
test('preview timers advance once per update and reset cleanly on resume',()=>{
 const clock={time:100,now(){return this.time;}},T=browserThree(clock),timer=new T.Timer();timer.update(140);assert.ok(Math.abs(timer.getDelta()-.04)<1e-6);const first=timer.getDelta();assert.equal(timer.getDelta(),first,'queries do not advance the clock');timer.update(156);assert.ok(Math.abs(timer.getDelta()-.016)<1e-6);clock.time=10000;timer.reset();timer.update(10016);assert.ok(Math.abs(timer.getDelta()-.016)<1e-6,'resume excludes time spent paused');timer.dispose();
});
