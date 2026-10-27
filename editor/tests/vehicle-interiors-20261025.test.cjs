'use strict';
// Vehicle lettering keeps clear of door hardware, and every ridden vehicle
// has a cabin people fit in: shaped seats, controls and seat markers where
// the seats are.
const test=require('node:test'),assert=require('node:assert/strict');
const V=require('../src/forge/Props/VehicleProp.js'),Finish=require('../src/forge/Props/VehicleFinish.js');
const boundsOf=(p,pick=()=>true)=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.positions.length;i+=3){const q=[p.positions[i],p.positions[i+1],p.positions[i+2]];if(!pick(q))continue;for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],q[k]);hi[k]=Math.max(hi[k],q[k]);}}return{lo,hi};};
// The parts as decorate() sees them, before draw-call consolidation merges hardware by material.
function decorated(recipe){
    const original=Finish.decorate;let seen=null;
    Finish.decorate=function(parts){seen=parts;return original.apply(this,arguments);};
    try{V.build(recipe);}finally{Finish.decorate=original;}
    return seen;
}
test('door lettering is laid clear of the door handle on every road vehicle, with a gap',()=>{
    for(const form of ['truck','compact','sport']){
        const parts=decorated(V.fromPreset(form)),letters=parts.find(p=>p.name==='Vehicle lettering'),handle=parts.find(p=>p.name==='Door handle recess');
        assert.ok(letters&&handle,form);
        for(const side of [-1,1]){
            const h=boundsOf(handle,q=>q[0]*side>0),t=boundsOf(letters,q=>q[0]*side>0&&q[1]>h.lo[1]-.2&&q[1]<h.hi[1]+.2);
            if(!Number.isFinite(t.lo[2]))continue;
            const overlapZ=Math.min(t.hi[2],h.hi[2])-Math.max(t.lo[2],h.lo[2]),overlapY=Math.min(t.hi[1],h.hi[1])-Math.max(t.lo[1],h.lo[1]);
            assert.ok(!(overlapZ>-.02&&overlapY>0),`${form} side ${side}: lettering ${t.lo[2].toFixed(3)}..${t.hi[2].toFixed(3)} reaches the handle ${h.lo[2].toFixed(3)}..${h.hi[2].toFixed(3)}`);
        }
    }
});
test('ridden vehicles have seats for their riders; transports seat passengers',()=>{
    const want={compact:4,sport:2,truck:2,rover:6,hover:4,shuttle:6,walker:1};
    for(const [form,n]of Object.entries(want)){
        const parts=decorated(V.fromPreset(form)),seats=parts.filter(p=>p.name==='Cabin seat upholstery');
        assert.ok(seats.length,form+' has seats');
        assert.ok(parts.some(p=>p.name==='Dashboard housing'),form+' has a dash');
        const r=V.build(V.fromPreset(form)),block=r.sidecarExtra.vehicle;
        if(block){assert.ok(block.seats.length>=n,`${form}: ${block.seats.length} seat markers`);assert.equal(block.seats[0].posture,'seated');for(const k of ['seat','handL','handR','footL','footR'])assert.ok(block.seats[0][k]&&block.seats[0][k].at.every(Number.isFinite),form+' driver '+k);
            assert.ok(block.controls[0]&&r.parts.some(p=>p.name===block.controls[0].part),form+' steering wheel part');}
    }
});
test('a road seat marker sits on a built seat, inside the cabin, under the roof',()=>{
    for(const form of ['compact','sport','truck','rover']){
        const r=V.build(V.fromPreset(form)),seat=r.parts.find(p=>p.name==='Cabin seat upholstery'),b=boundsOf(seat);
        for(const s of r.sidecarExtra.vehicle.seats){const [x,y,z]=s.seat.at;assert.ok(x>b.lo[0]-.01&&x<b.hi[0]+.01&&y>b.lo[1]&&y<b.hi[1]&&z>b.lo[2]-.01&&z<b.hi[2]+.01,`${form}: seat marker ${s.seat.at.map(v=>v.toFixed(2))} off the seats`);}
        // Headrests clear the roof; the driver's hip sits a seated body's height under it.
        const roof=boundsOf(r.parts.find(p=>p.name==='Crowned roof panel')||r.parts.find(p=>/secondary/.test(p.name))).lo[1];
        assert.ok(b.hi[1]<roof,`${form}: seats ${b.hi[1].toFixed(2)} reach the roof ${roof.toFixed(2)}`);
        assert.ok(roof-r.sidecarExtra.vehicle.seats[0].seat.at[1]>.62,form+' headroom');
    }
});
test('turning the interior off removes the cabin and its seat markers',()=>{
    for(const form of ['compact','hover','walker']){const r=V.build({...V.fromPreset(form),interior:false});assert.ok(!r.parts.some(p=>p.name==='Cabin seat upholstery'),form);const block=r.sidecarExtra.vehicle;assert.ok(!block||!block.seats,form+' no seat markers');}
});
