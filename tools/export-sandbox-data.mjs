// Read only literal catalog declarations; importing input.js would start its UI.
import { C } from './test-support.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { PAL } from '../js/render/terrain.js';
import { LIQ } from '../js/liquids.js';
import { BCAP, BCOND, LCOND, AIR_COND, HEAT_SPEED } from '../js/matter.js';
import { RULES } from '../js/chem.js';
import { REACT, SWAP } from '../js/reactions.js';
import * as D from '../js/devices.js';
import { PUMP_RATE } from '../js/pumps.js';
import { RYB, TINTS } from '../js/solutes.js';
import { SPLIT, SPLIT_TRIES } from '../js/power.js';
import { PIPE_RATE, MIN_DROP, MAX_SOURCES } from '../js/pipes.js';
const source=readFileSync('js/input.js','utf8');
const deviceSource=readFileSync('js/devices.js','utf8');
const geyserRest=JSON.parse(deviceSource.match(/GEYSER_REST = (\[[^\]]+\])/)[1]);
const literal=name=>source.slice(source.indexOf(`const ${name} = [`)+name.length+9).split('];')[0]+']';
const tools=vm.runInNewContext(literal('TOOLS'),{...C},{timeout:1000});
const names=vm.runInNewContext(literal('BLOCKS'),{},{timeout:1000});
const put=(path,value)=>{if(!existsSync(path)||readFileSync(path,'utf8')!==value)writeFileSync(path,value);};
const machineIds=new Set(Object.keys(D.DEVICE_NAMES).map(Number));
machineIds.add(C.PIPE);machineIds.add(C.PUMP_IN);machineIds.add(C.PUMP_OUT);
const powderIds=[C.SAND,C.SUGAR,C.SALT,C.SNOW,C.SODA,C.ASH,C.QUICKLIME];
// Explicit config declaration boundaries distinguish block IDs from liquid IDs.
const config=readFileSync('js/config.js','utf8');
const blockText=config.slice(config.indexOf('const AIR'),config.indexOf('const NBLOCK'));
const liquidText=config.slice(config.indexOf('const NONE'),config.indexOf('const NLIQ'));
const symbols=text=>[...text.matchAll(/\b([A-Z][A-Z0-9_]*)\s*=\s*\d+/g)].map(m=>m[1]);
const catalog=[];
for(let id=1;id<40;id++){
 const row=tools.find(t=>t.liquid===id), native=JSON.parse(readFileSync('godot/data/native_fluids.json','utf8')).fluids.find(t=>t.id===id);
 if(!LIQ[id]&&!native)continue;
 const f=LIQ[id],rgb=native?.rgb??[f.br,f.bg,f.bb];
 catalog.push({code:id,name:row?.name??native?.name??({13:'Tonic',14:'Foam',17:'Smoke',34:'Emulsion'}[id]),category:'Liquids',color:row?.color??'#'+rgb.map(n=>n.toString(16).padStart(2,'0')).join('')});
}
for(let id=1;id<names.length;id++){
 if(id===C.PUMP_IN||id===C.PUMP_OUT)continue;
 const row=tools.find(t=>t.block===id||t.device===id);
 const p=PAL[id],c=p?.base[0]??0xff807060;
 catalog.push({code:-id,name:row?.name??names[id][0].toUpperCase()+names[id].slice(1),category:machineIds.has(id)?'Machines':powderIds.includes(id)?'Powders':'Terrain',color:row?.color??'#'+[c&255,(c>>>8)&255,(c>>>16)&255].map(n=>n.toString(16).padStart(2,'0')).join('')});
}
catalog.push({code:301,name:'Pump · place inlet, then outlet',category:'Machines',color:'#8ca4be'},{code:302,name:'Wire · switch, then targets',category:'Machines',color:'#f2c94c'});
for(const t of tools.filter(t=>t.dye!==undefined))catalog.push({code:400+t.dye,name:t.name,category:'Liquids',color:t.color});
put('godot/generated/sandbox_catalog.json',JSON.stringify(catalog,null,2)+'\n');
const num=n=>Number.isFinite(n)?String(n):n>0?'1e30':'-1e30';
let h='// Generated from the browser reference. Do not edit.\n#pragma once\n#include "materials.hpp"\nnamespace ecologist {\n';
h+=symbols(blockText).map(n=>`inline constexpr int B_${n}=${C[n]};`).join('\n')+'\n';
h+=symbols(liquidText).map(n=>`inline constexpr int L_${n}=${C[n]};`).join('\n')+'\n';
h+=`inline constexpr int BLOCK_COUNT=${C.NBLOCK};\n`;
h+=`inline constexpr double INK_COLORS[8][3]={${RYB.map(row=>'{'+row.join(',')+'}').join(',')}};\n`;
h+=`inline constexpr double SOLUTE_TINTS[][5]={${TINTS.map(([s,c,w])=>'{'+[s,...c,w].join(',')+'}').join(',')}};\n`;
for(const [name,values] of [['BLOCK_CAP',BCAP],['BLOCK_COND',BCOND],['LIQ_COND',Array.from(LCOND,(v,i)=>i>=35?LCOND[1]:v)]])h+=`inline constexpr double ${name}[]={${Array.from(values,num).join(',')}};\n`;
h+=`inline constexpr double AIR_CONDUCTANCE=${AIR_COND}, HEAT_RATE=${HEAT_SPEED};\n`;
h+=`inline constexpr int ELECTROLYSIS_AMOUNT=${SPLIT}, ELECTROLYSIS_TRIES=${SPLIT_TRIES};\n`;
for(const [name,value] of Object.entries({PUMP_RATE,PIPE_RATE,MIN_DROP,MAX_SOURCES,SPRING_RATE:D.SPRING_RATE,DRAIN_RATE:D.DRAIN_RATE,BOILER_TEMP:D.BOILER_TEMP,BOILER_HEAT:D.BOILER_HEAT,SEPARATE_RATE:D.SEPARATE_RATE,SEPARATE_LIMIT:D.SEPARATE_LIMIT,MOTOR_RATE:D.MOTOR_RATE,MEMBRANE_RATE:D.MEMBRANE_RATE,BATTERY_CAP:D.BATTERY_CAP,GEYSER_HEAT:D.GEYSER_HEAT,GEYSER_BURST:D.GEYSER_BURST,GEYSER_REST_MIN:geyserRest[0],GEYSER_REST_MAX:geyserRest[1],GEYSER_SPOUT:Number(deviceSource.match(/GEYSER_SPOUT = (\d+)/)[1]),VENT_EVERY:D.VENT_EVERY}))h+=`inline constexpr double CFG_${name}=${value};\n`;
h+=`inline constexpr bool DEVICE_KIND(int id){ switch(id){${[...machineIds].filter(i=>i!==C.PIPE&&i!==C.PUMP_IN&&i!==C.PUMP_OUT).map(id=>`case ${id}:`).join('')}return true;default:return false;} }\n`;
h+='struct ContactRule {int block,kind,to_block,to_liquid; double to_temp,slag,above,rate,uses,heat; int gas,gas_amount; std::array<double,NSOL> solutes; bool alone,air,sealed,wet_air,salt_faster,use_touch; int touch1,touch2,touch_liquid; double touch_temp;};\n';
const rules=[];
for(const r of RULES)for(const b of [].concat(r.block)){
 const kind=typeof r.with==='string'?{acid:0,base:1,water:2}[r.with]:r.with===undefined?-1:3+r.with;
 const to=typeof r.to==='object'?r.to:{block:r.to}; const touch=[].concat(r.touching??[]);const ts=typeof r.usesTouching==='object'?r.usesTouching:{};
 const sol=Array(C.NSOL).fill(0);for(const [s,a]of r.sol??[])sol[s]=a;
 rules.push(`{${[b,kind,to.block??0,to.liquid??0,to.temp??20,to.slag??0,r.above??-Infinity,r.rate,r.uses??0,r.heat??0,r.gas?.[0]??0,r.gas?.[1]??0].map(num).join(',')},{${sol.join(',')}},${[!!r.alone,!!r.air,!!r.sealed,!!r.wetAir,!!r.saltFaster,!!r.usesTouching].join(',')},${touch[0]??0},${touch[1]??0},${ts.liquid??0},${ts.temp??20}}`);
}
h+=`inline constexpr ContactRule CONTACT_RULES[]={\n${rules.join(',\n')}\n};\n`;
h+=`inline constexpr int PAIR_BLOCK[]={${REACT.map(r=>r&&r!==SWAP&&r.block?r.block:0).join(',')}};\n}\n`;
put('native/generated/sandbox.hpp',h);
const vector=c=>`vec3(${[c&255,(c>>>8)&255,(c>>>16)&255].map(n=>(n/255).toFixed(7)).join(',')})`;
const palettes=[];
for(let id=0;id<C.NBLOCK;id++){
 const p=PAL[id]??PAL[C.METAL]??PAL[C.STONE];palettes.push(...[...p.base,p.out,p.hl].map(vector));
}
put('godot/generated/blocks.gdshaderinc',`// Generated browser block palettes.\nconst vec3 BLOCK_COLORS[${palettes.length}]=vec3[${palettes.length}](${palettes.join(',\n')});\n`);
console.log(`Exported ${names.length-1} block IDs, ${catalog.length} tools and ${rules.length} expanded block reactions.`);
process.exit(0);
