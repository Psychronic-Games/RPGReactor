// Tiny software renderer: triangles with per-vertex colors (or a texture by uv), lambert + ambient, z-buffer.
const { PNG } = require('pngjs');
const fs = require('fs');
function render(meshes, opts) {
  const W = opts.w || 480, H = opts.h || 480;
  const img = new Uint8Array(W * H * 4), zb = new Float32Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i++) { const g = 40 + 30 * (1 - i / W / H); img[i*4]=g; img[i*4+1]=g+4; img[i*4+2]=g+12; img[i*4+3]=255; }
  const yaw = opts.yaw ?? 0.4, pitch = opts.pitch ?? 0.15, dist = opts.dist ?? 6, t = opts.target || [0.8, 3, 0], fov = opts.fov || 0.6;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const eye = [t[0] + sy * cp * dist, t[1] + sp * dist, t[2] + cy * cp * dist];
  const f = [t[0]-eye[0], t[1]-eye[1], t[2]-eye[2]]; let l = Math.hypot(...f); f[0]/=l;f[1]/=l;f[2]/=l;
  let r = [f[1]*0 - f[2]*1, f[2]*0 - f[0]*0, f[0]*1 - f[1]*0]; l = Math.hypot(...r); r = r.map(v=>v/l);
  const u = [r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0]];
  const light = (() => { const v=[0.5,0.8,0.6]; const k=Math.hypot(...v); return v.map(x=>x/k); })();
  const proj = p => { const d=[p[0]-eye[0],p[1]-eye[1],p[2]-eye[2]]; const z=d[0]*f[0]+d[1]*f[1]+d[2]*f[2]; const x=d[0]*r[0]+d[1]*r[1]+d[2]*r[2]; const y=d[0]*u[0]+d[1]*u[1]+d[2]*u[2]; const s=(H/2)/Math.tan(fov/2)/z; return [W/2 + x*s, H/2 - y*s, z]; };
  for (const m of meshes) {
    const P = m.positions, I = m.index;
    for (let k = 0; k < I.length; k += 3) {
      const ia=I[k], ib=I[k+1], ic=I[k+2];
      const A=[P[ia*3],P[ia*3+1],P[ia*3+2]], B=[P[ib*3],P[ib*3+1],P[ib*3+2]], C=[P[ic*3],P[ic*3+1],P[ic*3+2]];
      const e1=[B[0]-A[0],B[1]-A[1],B[2]-A[2]], e2=[C[0]-A[0],C[1]-A[1],C[2]-A[2]];
      let n=[e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]]; const nl=Math.hypot(...n)||1; n=n.map(v=>v/nl);
      const toEye=[eye[0]-A[0],eye[1]-A[1],eye[2]-A[2]];
      if (n[0]*toEye[0]+n[1]*toEye[1]+n[2]*toEye[2] < 0) { if (!m.doubleSided) continue; n=n.map(v=>-v); }
      const sh = 0.35 + 0.65 * Math.max(0, n[0]*light[0]+n[1]*light[1]+n[2]*light[2]);
      const a=proj(A), b=proj(B), c=proj(C);
      if (a[2]<0.05||b[2]<0.05||c[2]<0.05) continue;
      const minx=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))), maxx=Math.min(W-1,Math.ceil(Math.max(a[0],b[0],c[0])));
      const miny=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))), maxy=Math.min(H-1,Math.ceil(Math.max(a[1],b[1],c[1])));
      const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]); if (Math.abs(area)<1e-9) continue;
      for (let y=miny;y<=maxy;y++) for (let x=minx;x<=maxx;x++) {
        const px=x+0.5, py=y+0.5;
        let w0=((b[0]-px)*(c[1]-py)-(b[1]-py)*(c[0]-px))/area, w1=((c[0]-px)*(a[1]-py)-(c[1]-py)*(a[0]-px))/area, w2=1-w0-w1;
        if (w0<0||w1<0||w2<0) continue;
        const z=w0*a[2]+w1*b[2]+w2*c[2]; const o=y*W+x; if (z>=zb[o]) continue;
        let col;
        if (m.texture && m.uvs) {
          const U=m.uvs; const uu=w0*U[ia*2]+w1*U[ib*2]+w2*U[ic*2], vv=w0*U[ia*2+1]+w1*U[ib*2+1]+w2*U[ic*2+1];
          const tx=Math.min(m.texture.width-1,Math.max(0,Math.floor(uu*m.texture.width))), ty=Math.min(m.texture.height-1,Math.max(0,Math.floor(vv*m.texture.height)));
          const q=(ty*m.texture.width+tx)*4; if (m.texture.data[q+3]<128) continue;
          col=[m.texture.data[q],m.texture.data[q+1],m.texture.data[q+2]];
          if (m.colors) col=col.map((value,j)=>value*Math.pow(Math.max(0,w0*m.colors[ia*3+j]+w1*m.colors[ib*3+j]+w2*m.colors[ic*3+j]),1/2.2));
        } else if (m.colors) { col=[0,1,2].map(j=>255*Math.pow(w0*m.colors[ia*3+j]+w1*m.colors[ib*3+j]+w2*m.colors[ic*3+j],1/2.2)); }
        else col = m.color || [200,200,200];
        zb[o]=z; img[o*4]=Math.min(255,col[0]*sh); img[o*4+1]=Math.min(255,col[1]*sh); img[o*4+2]=Math.min(255,col[2]*sh);
      }
    }
  }
  const png = new PNG({ width: W, height: H }); png.data = Buffer.from(img); return PNG.sync.write(png);
}
function sheet(images, cols, file) { // images: PNG buffers same size
  const decoded = images.map(b => PNG.sync.read(b)); const w = decoded[0].width, h = decoded[0].height, rows = Math.ceil(decoded.length/cols);
  const out = new PNG({ width: w*cols, height: h*rows });
  decoded.forEach((d, k) => { const ox=(k%cols)*w, oy=Math.floor(k/cols)*h; for (let y=0;y<h;y++) d.data.copy(out.data, ((oy+y)*w*cols+ox)*4, y*w*4, (y+1)*w*4); });
  fs.writeFileSync(file, PNG.sync.write(out));
}
module.exports = { render, sheet };
