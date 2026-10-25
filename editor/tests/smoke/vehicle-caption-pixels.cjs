'use strict';
/** Count enclosed dark counters in an isolated light-on-dark caption crop.
 * RANGER 17 has three: R, A, R. Extra counters reveal merged glyph edges;
 * missing counters reveal filled letter holes. This is a narrow regression,
 * not an aesthetic score for the model. */
function captionCounters(png){
 const w=png.width,h=png.height,seen=new Uint8Array(w*h),dark=new Uint8Array(w*h),holes=[];
 for(let i=0;i<w*h;i++)dark[i]=png.data[i*4]+png.data[i*4+1]+png.data[i*4+2]<510?1:0;
 for(let i=0;i<w*h;i++){if(seen[i]||!dark[i])continue;const queue=[i];seen[i]=1;let border=false;
  for(let j=0;j<queue.length;j++){const at=queue[j],x=at%w,y=Math.floor(at/w);if(!x||!y||x===w-1||y===h-1)border=true;
   for(const next of [x?at-1:-1,x<w-1?at+1:-1,y?at-w:-1,y<h-1?at+w:-1])if(next>=0&&!seen[next]&&dark[next]){seen[next]=1;queue.push(next);}}
  if(!border&&queue.length>=2)holes.push(queue.length);
 }
 return holes.sort((a,b)=>a-b);
}
module.exports={captionCounters};
