// Prepare a matched HTML/Godot fixture, or compare the GPU captures with actual HTML pixels.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { C, Wd, at, clearWorld, fill, box } from './test-support.mjs';
import { LIQ } from '../js/liquids.js';
import { frame } from '../js/canvas.js';
import { classifyFalling } from '../js/render/render.js';
import { drawBody, drawStream } from '../js/render/liquids.js';

const folder='.test-artifacts', width=1280, height=800, times=[0,3.25];
mkdirSync(folder,{recursive:true});
function png(path,bytes) {
  const crc=buffer=>{let c=0xffffffff;for(const b of buffer){c^=b;for(let bit=0;bit<8;bit++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;};
  const chunk=(name,data)=>{const body=Buffer.concat([Buffer.from(name),data]),a=Buffer.alloc(4),b=Buffer.alloc(4);a.writeUInt32BE(data.length);b.writeUInt32BE(crc(body));return Buffer.concat([a,body,b]);};
  const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)bytes.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  writeFileSync(path,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
if(process.argv.includes('--compare')) {
  const report=[];
  for(let i=0;i<times.length;i++) {
    const expected=readFileSync(`${folder}/liquid-html-${i}.bin`),actual=readFileSync(`${folder}/liquid-godot-${i}.bin`);
    assert.equal(actual.length,expected.length);
    let sum=0,max=0,large=0,exact=0,foreground=0,foregroundLarge=0,foregroundSum=0;
    for(let p=0;p<actual.length;p+=4) {
      let delta=0,pixelSum=0;for(let c=0;c<3;c++){const d=Math.abs(actual[p+c]-expected[p+c]);sum+=d;pixelSum+=d;delta=Math.max(delta,d);}
      max=Math.max(max,delta);if(delta>3)large++;if(delta===0)exact++;
      if(expected[p]!==30 || expected[p+1]!==46 || expected[p+2]!==64) {foreground++;foregroundSum+=pixelSum;if(delta>3)foregroundLarge++;}
    }
    const result={time:times[i],mean_rgb_error:sum/(width*height*3),max_channel_error:max,percent_within_3:100*(1-large/(width*height)),percent_exact:100*exact/(width*height),liquid_pixels:foreground,liquid_mean_rgb_error:foregroundSum/(foreground*3),liquid_percent_within_3:100*(1-foregroundLarge/foreground)};
    report.push(result);console.log(result);
    assert.ok(result.mean_rgb_error<0.5,'Mean GPU/HTML RGB error must stay below half a color level');
    assert.ok(result.percent_within_3>99.8,'At least 99.8% of pixels must match within 3/255 per color');
    assert.ok(result.liquid_mean_rgb_error<0.5 && result.liquid_percent_within_3>99.8,'Liquid pixels must pass independently of the empty backdrop');
  }
  assert.notDeepEqual(readFileSync(`${folder}/liquid-godot-0.bin`),readFileSync(`${folder}/liquid-godot-1.bin`),'Liquid appearance animates');
  writeFileSync(`${folder}/liquid-visual-comparison.json`,JSON.stringify(report,null,2));
  console.log('PASS matched HTML/GPU rendering at two animation times');process.exit(0);
}

// A failed GPU run must never be able to pass using screenshots from an earlier run.
for(let i=0;i<times.length;i++)for(const extension of ['bin','png'])rmSync(`${folder}/liquid-godot-${i}.${extension}`,{force:true});
clearWorld(7);Wd.S.seed=7;Wd.under.fill(0);Wd.S.timeMode='day';Wd.S.momentum=true;
const types=[C.WATER,C.OIL,C.HONEY,C.STEAM,C.QUICK,C.FOAM,C.LAVA,C.ACID,C.FROST,C.AETHER,C.SLIME,C.BLOOM,C.TONIC,C.STORM];
types.forEach((type,index)=>{
  const x=5+(index%7)*22,y=14+Math.floor(index/7)*38,g=LIQ[type].grav;
  fill(x,y,x+14,y+11,type,LIQ[type].paintT);
  box(x-1,y-1,x-1,y+12,C.STONE);box(x+15,y-1,x+15,y+12,C.STONE);
  box(x,g>0?y+12:y-1,x+14,g>0?y+12:y-1,C.STONE);
  // Full and partial surfaces, continuous columns, different stream widths and pool joins.
  for(let xx=x;xx<x+7;xx++) Wd.liq[at(xx,g>0?y:y+11)]=128;
  for(let j=1;j<=6;j++) {
    const k=at(x+3,g>0?y-j:y+11+j);Wd.liq[k]=40+j*28;Wd.typ[k]=type;
  }
  Wd.vel[at(x+10,g>0?y:y+11)]=0.75;
});
// Explicit left/right lip alignment and map edges.
fill(0,0,0,3,C.WATER,20,75);fill(159,0,159,4,C.STEAM,110,100);
fill(10,90,16,90,C.WATER,20,255);box(10,91,15,91,C.STONE);fill(16,91,16,95,C.WATER,20,85);
fill(28,90,34,90,C.HONEY,20,255);box(29,91,34,91,C.STONE);fill(28,91,28,95,C.HONEY,20,85);
const fields=['solid','liq','typ','drop','awake','stamp','flux','temp','vel','latent','sol'];
const header=Buffer.alloc(28);header.write('ECOTR1\0\0');[C.W,C.H,0,7,0].forEach((v,i)=>header.writeUInt32LE(v,8+i*4));
writeFileSync(`${folder}/liquid-visual-input.bin`,Buffer.concat([header,...fields.map(name=>Buffer.from(Wd[name].buffer))]));
const child=spawnSync('native/build/ecologist-core.exe',['--render-cells',`${folder}/liquid-visual-input.bin`,`${folder}/liquid-visual-cells.bin`],{encoding:'utf8'});
assert.equal(child.status,0,child.error?.message||child.stderr);
const native=readFileSync(`${folder}/liquid-visual-cells.bin`);
Wd.fall.fill(0);
for(let y=0;y<C.H;y++)for(let x=0;x<C.W;x++){const k=at(x,y);if(Wd.liq[k]&&LIQ[Wd.typ[k]].grav>0)classifyFalling(k,x,y,Wd.typ[k]);}
for(let y=C.H-1;y>=0;y--)for(let x=0;x<C.W;x++){const k=at(x,y);if(Wd.liq[k]&&LIQ[Wd.typ[k]].grav<0)classifyFalling(k,x,y,Wd.typ[k]);}
for(let index=0;index<times.length;index++) {
  const time=times[index];frame.fill(0xff402e1e);
  const depths=new Uint16Array(C.W);
  for(let y=0;y<C.H;y++)for(let x=0;x<C.W;x++) {
    const k=at(x,y),amount=Wd.liq[k];if(!amount){depths[x]=0;continue;}
    const type=Wd.typ[k],g=LIQ[type].grav,pk=k-C.W*g,prevIn=g>0?y>0:y<C.H-1;
    const prevSame=prevIn&&Wd.liq[pk]&&Wd.typ[pk]===type;
    const offset=C.W*C.H*4+k*4;
    assert.equal(native[offset],Wd.fall[k],`fall ${x},${y}`);
    if(Wd.fall[k]) {
      assert.equal(native[offset+1],Wd.salign[k],`alignment ${x},${y}`);
      drawStream(x,y,amount,type,0,C.T,Wd.salign[k],time);depths[x]=0;continue;
    }
    const prevFall=prevSame&&Wd.fall[pk];
    if(prevSame&&!prevFall) {
      if(g>0)depths[x]++;else depths[x]=0;
      assert.equal(native[offset+2],8);assert.equal(native[offset+3],g>0?depths[x]:1);
      drawBody(x,y,8,false,type,g>0?depths[x]:1,time);continue;
    }
    const h=Math.max(1,Math.min(8,Math.round(amount*8/255)));
    assert.equal(native[offset+2],h);assert.equal(native[offset+3],0);
    if(prevFall)drawStream(x,y,Wd.liq[pk],type,g>0?0:h,g>0?8-h:8,Wd.salign[pk],time);
    depths[x]=0;drawBody(x,y,h,true,type,0,time);
  }
  const bytes=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)Buffer.from(frame.buffer,y*C.PW*4,width*4).copy(bytes,y*width*4);
  writeFileSync(`${folder}/liquid-html-${index}.bin`,bytes);png(`${folder}/liquid-html-${index}.png`,bytes);
}
console.log('PASS native geometry matches HTML falling, alignment, body height and depth; reference images prepared');
process.exit(0);
