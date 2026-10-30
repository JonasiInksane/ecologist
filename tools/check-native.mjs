// Differential tests against the real browser liquid pass, with reactions/effects excluded in both ports.
import assert from 'node:assert/strict';
import { C, Wd, at, clearWorld, fill, box } from './test-support.mjs';
import { liquidTick } from '../js/sim.js';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const executable=resolve(process.argv[2] || 'native/build/ecologist-core.exe');
const fields=['solid','liq','typ','drop','awake','stamp','flux','temp','vel','latent','sol'];
let rng=1;
Math.random=()=>{rng=(rng+0x6d2b79f5)|0;let t=Math.imul(rng^(rng>>>15),rng|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
const folder='.test-artifacts/native-parity';mkdirSync(folder,{recursive:true});
function encode(steps) {
  const header=Buffer.alloc(28);header.write('ECOTR1\0\0');
  [C.W,C.H,Wd.S.tick,rng>>>0,steps].forEach((v,i)=>header.writeUInt32LE(v,8+i*4));
  return Buffer.concat([header,...fields.map(n=>Buffer.from(Wd[n].buffer,Wd[n].byteOffset,Wd[n].byteLength))]);
}
function contents(x,y,salt,sugar,oxygen=0) {
  const k=at(x,y);Wd.sol[k*C.NSOL+C.SOL_SALT]=salt;Wd.sol[k*C.NSOL+C.SOL_SUGAR]=sugar;Wd.sol[k*C.NSOL+C.SOL_O2]=oxygen;
  Wd.latent[k]=13.25;Wd.vel[k]=0.375;
}
const cases=[
 ['fall and spread',()=>fill(30,20,52,35,C.WATER,20)],
 ['uneven sides and fractional ingredients',()=>{box(0,61,C.W-1,61,C.STONE);for(const [x,a] of [[40,250],[41,255],[42,1]]){const k=at(x,60);Wd.liq[k]=a;Wd.typ[k]=C.WATER;Wd.temp[k]=x===40?10:70;contents(x,60,x*0.625,300.25,-12.75);}}],
 ['viscosity',()=>{fill(20,20,30,28,C.HONEY,2);fill(60,20,70,28,C.HONEY,95);fill(100,20,110,28,C.OIL,-5);}],
 ['rising steam and swaps',()=>{fill(60,80,80,90,C.STEAM,110);fill(60,60,80,70,C.WATER,20);fill(120,30,135,35,C.QUICK,20);fill(120,40,135,55,C.OIL,20);}],
 ['density layers',()=>{fill(40,30,55,55,C.WATER,20);box(39,30,39,56,C.STONE);box(56,30,56,56,C.STONE);box(39,56,56,56,C.STONE);for(let y=30;y<42;y++)for(let x=40;x<=55;x++)contents(x,y,450.375,12.5,-20);}],
 ['water oil impact',()=>{fill(50,30,65,35,C.WATER,20);fill(50,48,65,50,C.OIL,20);box(45,51,70,51,C.STONE);}],
 ['world boundaries',()=>{fill(0,0,2,8,C.WATER,20);fill(C.W-3,0,C.W-1,8,C.WATER,20);fill(30,0,34,2,C.STEAM,110);}],
 ['sleeping chunks and edit wake',()=>{Wd.awake.fill(0);fill(31,46,33,48,C.WATER,20);Wd.awake.fill(0);Wd.wake(at(32,46));}],
];
let checks=0;
for(const [name,setup] of cases) for(const steps of [1,8,64,180]) {
  clearWorld(7);rng=73;setup();
  const input=`${folder}/input.bin`,output=`${folder}/output.bin`;
  writeFileSync(input,encode(steps));
  const child=spawnSync(executable,[input,output],{encoding:'utf8'});
  assert.equal(child.status,0,child.error?.message || child.stderr);
  for(let i=0;i<steps;i++){Wd.S.tick++;liquidTick(false,false);for(let c=0;c<Wd.awake.length;c++)if(Wd.awake[c])Wd.awake[c]--;}
  const actual=readFileSync(output),expected=encode(0);
  assert.equal(actual.length,expected.length);
  assert.deepEqual(actual.subarray(0,28),expected.subarray(0,28),`${name}, ${steps} ticks: clock/RNG`);
  let offset=28;
  for(const field of fields){
    const end=offset+Wd[field].byteLength;
    if (!actual.subarray(offset,end).equals(expected.subarray(offset,end))) {
      let first=offset; while(actual[first]===expected[first]) first++;
      assert.fail(`${name}, ${steps} ticks: ${field} differs at byte ${first-offset} (${actual[first]} vs ${expected[first]})`);
    }
    offset=end;
  }
  checks++;console.log(`PASS ${name}: ${steps} ticks, all arrays and RNG exactly match`);
}
console.log(JSON.stringify({ok:true,checks,scope:'isolated transport, reaction and cosmetic callbacks excluded'}));
process.exit(0);
