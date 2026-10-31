'use strict';
const assert = require('node:assert/strict'), test = require('node:test');
const { fightWorld, event } = require('./helpers/fight-world.cjs');
const Hud = require('../../runtime/reactor_ui_fight.js');
function battle() {
    const w = fightWorld({ tactical: true, events: [event(1,3,2,{note:'<unit: enemy 1>'}),event(2,12,10,{note:'<unit: enemy 1>'})] });
    w.Bitmap = class { clear(){this.text='';} fillRect(){} drawText(text){this.text=text;this.draws=(this.draws||0)+1;} destroy(){this.destroyed=true;} };
    w.Sprite = class { constructor(bitmap){this.bitmap=bitmap;this.anchor={};} };
    w.ReactorFightHud=Hud;
    w.$dataSkills[3]={...w.$dataSkills[1],id:3,name:'Unsteady shot',successRate:65,note:'<range: 4>'};
    w.$gameActors.actor(1).learnSkill(3);
    const f=w.$gameFight;assert.ok(f.start({mode:'tactical'})>0);w.run(600,()=>f.awaitsPlayer());
    assert.ok(f.commandSelectUnit(f._units.find(u=>u.actorId===1).id));assert.ok(f.commandMoveTo(2,2));
    const U=w.ReactorFight.UnitMarks;
    U.layer={addChild(s){s.parent=this;},visible:true};
    return {w,f,U,draw(){U.placeForecast({},true);return U.forecast;}};
}

test('a hovered target shows the selected attack or skill forecast and redraws only on change',()=>{
    const {f,draw}=battle();assert.ok(f.commandAttack());f.setCursor(3,2);
    let v=draw();assert.equal(v.sprite.visible,true);assert.equal(v.text,'Hit '+Hud.percent(f.preview(f.unitOfEvent(1)).hit));
    const draws=v.bitmap.draws;for(let i=0;i<20;i++)draw();assert.equal(v.bitmap.draws,draws,'steady hover reuses the bitmap');
    assert.ok(f.commandCancel());assert.ok(f.commandSkill(3));f.setCursor(3,2);
    v=draw();assert.equal(v.sprite.visible,true);assert.equal(v.text,'Hit '+Hud.percent(f.preview(f.unitOfEvent(1)).hit));assert.notEqual(v.bitmap.draws,draws);
});

test('the chance badge hides for invalid targets, empty ground, cancelled actions and cinematic shots',()=>{
    const {f,U,w,draw}=battle();assert.ok(f.commandAttack());f.setCursor(3,2);assert.equal(draw().sprite.visible,true);
    f.setCursor(12,10);assert.equal(draw().sprite.visible,false,'a distant enemy has no forecast');
    f.setCursor(4,2);assert.equal(draw().sprite.visible,false,'empty ground');
    f.setCursor(3,2);assert.equal(draw().sprite.visible,true);w.ReactorFight.Marks.hidden=true;assert.equal(draw().sprite.visible,false);
    w.ReactorFight.Marks.hidden=false;assert.equal(draw().sprite.visible,true);
    assert.ok(f.commandCancel());assert.equal(draw().sprite.visible,false);U.placeForecast({},false);assert.equal(U.forecast.sprite.visible,false);
});
