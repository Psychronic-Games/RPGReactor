'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Q=require('./helpers/character-quality-matrix.cjs');
let popover;
const scope={window:{},console,setTimeout,clearTimeout,RRCharacterModel:Q.Model,RRCreatureBody:Q.Creature,RRHumanBody:Q.Body,
    RRCharacterSpecies:Q.Species,RRCharacterSkin:require('../src/forge/Character3D/CharacterSkin.js'),rrEscapeHtml:require('../src/utils/HtmlEscape.js'),
    RRColorPopover:{open:(anchor,options)=>popover={anchor,options}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/forge/Character3D/Character3DBuilder.js'),'utf8'),scope);
function builder(){const b=new scope.window.Character3DBuilder();b._renderPanel=()=>{};b._queueRebuild=()=>{};b._syncSliders=()=>{};b._fastShape=()=>false;return b;}
function click(b,dataset){const button={dataset};b._onClick({target:{closest:()=>button},preventDefault(){}});}
function range(b,path,value){b._onInput({target:{dataset:{path},type:'range',value:String(value)}},true);}
const plain=r=>JSON.parse(JSON.stringify(r));

test('catalog selections start from their own defaults across animals, variants and humanoids',()=>{
    const b=builder();click(b,{act:'kind',id:'bee'});range(b,'girth',1.8);range(b,'wingSize',2);
    b._set('colors.coat','#ff00ff');b._set('anatomy.detail',true);b._commit();
    click(b,{act:'kind',id:'crab'});assert.deepEqual(plain(b.recipe),Q.Creature.kindRecipe('crab'));
    range(b,'appendageLength',2);b._onInput({target:{tagName:'SELECT',dataset:{path:'crabType'},value:'fiddlerCrab'}},true);
    assert.deepEqual(plain(b.recipe),Q.Creature.withVariant(Q.Creature.kindRecipe('crab'),'crabType','fiddlerCrab'));
    click(b,{act:'species',id:'elf'});range(b,'weight',1.5);b._set('shapes.noseWidth',1.5);b._commit();
    click(b,{act:'species',id:'dwarf'});assert.deepEqual(plain(b.recipe),Q.Model.withSpecies({},'dwarf'));
    click(b,{act:'kind',id:'avian'});assert.deepEqual(plain(b.recipe),Q.Creature.kindRecipe('avian'));
    click(b,{act:'plan',plan:'human'});assert.deepEqual(plain(b.recipe),Q.Model.normalize({plan:'human'}));
    click(b,{act:'plan',plan:'quadruped'});assert.deepEqual(plain(b.recipe),Q.Creature.kindRecipe('dog'));
});

test('switching presets retires pending slider work, view caches and obsolete color callbacks',()=>{
    const b=builder();let stopped=0,applied=0,rebuilt=0;
    const result={};b._result=result;b._fast={result};b._shapeJob={gen:7,busy:true,result};b._shapeGen=7;
    b._shapeWorkerRef={terminate(){stopped++;}};b._view={height:100,structure:'old'};b._fastApply=()=>applied++;
    b.cache={stale:true};b.extreme=true;b.pose='attack';b._heldName='Old sword';b.openPicker='old';
    const anchor={dataset:{act:'color',path:'skin'},style:{setProperty(){}}};
    b._onClick({target:{closest:()=>anchor},preventDefault(){}});
    b._settle=setTimeout(()=>rebuilt++,10000);b._shadeTimer=setTimeout(()=>rebuilt++,10000);
    click(b,{act:'kind',id:'bee'});anchor.isConnected=false;popover.options.onChange('#ff00ff');popover.options.onInput('#00ff00');
    const fresh=plain(b.recipe);b._shapeDone({result:7});
    b._onInput({target:{isConnected:false,type:'range',dataset:{path:'girth'},value:'2'}},true);
    b._onInput({target:{tagName:'SELECT',dataset:{path:'morphology'},value:'avian'}},true);
    assert.deepEqual(plain(b.recipe),fresh);assert.deepEqual(fresh,Q.Creature.kindRecipe('bee'));
    assert.equal(stopped,1);assert.equal(applied,0);assert.equal(rebuilt,0);assert.equal(b._view.structure,null);
    assert.equal(b._view.height,0);assert.equal(b.pose,'idle');assert.equal(b.extreme,false);assert.equal(b._heldName,'');
    assert.deepEqual(plain(b.cache),{});assert.equal(b._shapeJob,null);
});

test('cat breeds and paired humanoid heads start fresh and survive undo',()=>{
    const b=builder();click(b,{act:'kind',id:'cat'});range(b,'snoutLength',1.5);
    b._onInput({target:{tagName:'SELECT',dataset:{path:'catType'},value:'persian'}},true);
    assert.deepEqual(plain(b.recipe),Q.Creature.withVariant(Q.Creature.kindRecipe('cat'),'catType','persian'));
    const persian=plain(b.recipe);click(b,{act:'species',id:'hydrata'});assert.equal(b.recipe.head.heads,2);
    click(b,{act:'species',id:'dragonborn'});assert.equal(b.recipe.head.heads,undefined);
    b._history(-1);assert.equal(b.recipe.head.heads,2);b._history(-1);assert.deepEqual(plain(b.recipe),persian);
});

test('undo and redo restore the edited recipe while rejecting results from an older shape job',()=>{
    const b=builder();click(b,{act:'kind',id:'bee'});range(b,'girth',1.5);const edited=plain(b.recipe);
    click(b,{act:'species',id:'elf'});const elf=plain(b.recipe);b._history(-1);assert.deepEqual(plain(b.recipe),edited);
    b._history(1);assert.deepEqual(plain(b.recipe),elf);
    let applied=0;const result={};b._result=result;b._fast={result};b._shapeJob={gen:11,busy:true,result};b._fastApply=()=>applied++;
    b._shapeDone({result:10});assert.equal(applied,0);assert.equal(b._shapeJob.busy,true);
    b._shapeDone({result:11,heads:[],shaped:new ArrayBuffer(0),normals:new ArrayBuffer(0)});assert.equal(applied,1);
});

test('humanoid species changes retain the fine anatomy preference while starting from fresh proportions',()=>{
    const b=builder();click(b,{act:'species',id:'human'});b._set('anatomy.detail',true);b._set('weight',2);b._commit();
    for(const species of ['elf','dwarf','vulcan','klingon','lizardfolk','human']){
        click(b,{act:'species',id:species});assert.equal(b.recipe.anatomy.detail,true,species);
        assert.deepEqual(plain(b.recipe),Q.Model.withSpecies({anatomy:{detail:true}},species));
    }
    click(b,{act:'kind',id:'dog'});click(b,{act:'species',id:'elf'});assert.equal(b.recipe.anatomy.detail,false);
});


test('female Human to Andorian retains gender and the real Body controls render with anatomical detail enabled',()=>{
    const b=builder();click(b,{act:'species',id:'human'});range(b,'gender',0);b._set('anatomy.detail',true);b._commit();
    assert.ok(b._bodyTab().includes('data-path="anatomy.labia"'));
    click(b,{act:'species',id:'andorian'});
    assert.equal(b.recipe.gender,0);assert.equal(b.recipe.anatomy.detail,true);
    assert.ok(b._bodyTab().includes('data-path="gender"'));assert.ok(b._bodyTab().includes('data-path="anatomy.labia"'));
    range(b,'gender',1);const male=b._bodyTab();assert.ok(male.includes('data-path="anatomy.paired"'));assert.ok(male.includes('type="checkbox"'));
    click(b,{act:'species',id:'klingon'});assert.equal(b.recipe.gender,1);assert.ok(b._bodyTab().includes('data-path="anatomy.paired"'));
});
