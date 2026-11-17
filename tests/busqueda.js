#!/usr/bin/env node
/* Comprueba que la lista de «Buscar» respeta el botón Relieve (buscarVisible).
   Uso:  node tests/busqueda.js   (desde la raíz del proyecto o desde tests/)
   Usa el relieve real (data/relieve.bin) y los pueblos de data/pueblos.js. */
'use strict';
process.chdir(require('path').resolve(__dirname,'..'));
const fs=require('fs');
const src=fs.readFileSync('scripts/app.js','utf8').replace(/\r/g,'');
function extraer(nombre){const i=src.indexOf('function '+nombre+'(');let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1)}}}
(async()=>{
  const buf=fs.readFileSync('data/relieve.bin');
  const r=await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
  const hl=new DataView(r).getUint32(0,true),hdr=JSON.parse(new TextDecoder().decode(new Uint8Array(r,4,hl)));
  const base=4+hl;let total=0;hdr.b.forEach(k=>total+=k.r*k.c);
  const lo=new Uint8Array(r,base,total),hi=new Uint8Array(r,base+total,total);let off=0,bl=[];
  hdr.b.forEach(k=>{const d=new Int16Array(k.r*k.c);for(let y=0;y<k.r;y++){let p=0;const o=off+y*k.c;for(let x=0;x<k.c;x++){p=(p+((hi[o+x]<<8)|lo[o+x]))<<16>>16;d[y*k.c+x]=p}}off+=k.r*k.c;bl.push({n:k.n,w:k.w,r:k.r,c:k.c,d})});
  const ctx=`var usarRelieve=true,pos=null,cacheV={},DEMLOC={s:${hdr.s},b:BL};function clave(p){return p.n}\n${extraer('elevLocal')}\nvar visBusc={};\n${extraer('buscarVisible')}\nreturn {buscarVisible,set:function(o){usarRelieve=o},demNull:function(){DEMLOC=null}}`;
  const api=new Function('BL',ctx)(bl);
  const rad=Math.PI/180;
  const dst=(a,b,c,d)=>{const dl=(c-a)*rad,dn=(d-b)*rad;const x=Math.sin(dl/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dn/2)**2;return 12742*Math.asin(Math.sqrt(x))};
  const datos=fs.readFileSync('data/pueblos.js','utf8').match(/"(.*)"/s)[1].split('\\n').map(l=>l.split('|')).filter(a=>a.length>=4).map(a=>({la:+a[0],lo:+a[1],n:a[2],t:a[3]}));
  let fallos=0;
  for(const [nom,la,lon] of [['Granada',37.1773,-3.5986],['Trevélez',37.0,-3.26],['Madrid',40.4168,-3.7038]]){
    const P0={latitude:la,longitude:lon};
    const cer=datos.map(p=>({...p,k:dst(la,lon,p.la,p.lo)})).filter(p=>p.k<=80&&p.k>0.4&&p.t!=='peak');
    let t0=Date.now(),vis=0,oc=[];
    for(const p of cer){if(api.buscarVisible(P0,p))vis++;else oc.push(p)}
    const ms=Date.now()-t0;
    console.log(`${nom}: ${cer.length} lugares <80 km → ${vis} visibles, ${oc.length} tapados (${ms} ms)`);
    console.log('  ejemplos tapados:',oc.slice(0,5).map(p=>p.n+' '+p.k.toFixed(0)+'km').join(', '));
    const cub={};for(const p of cer){const b=Math.floor(p.k/10)*10;cub[b]=cub[b]||[0,0];cub[b][0]++;if(api.buscarVisible(P0,p))cub[b][1]++}
    console.log('  visibles/total por tramo de 10 km:',Object.entries(cub).map(([b,v])=>b+':'+v[1]+'/'+v[0]).join(' '));
    api.set(false);const sinRel=cer.every(p=>api.buscarVisible(P0,p));api.set(true);
    console.log('  con Relieve apagado se muestran todos:',sinRel);
    if(!sinRel||oc.length===0||vis===0&&nom==='Madrid'){fallos++;console.log('  FALLO');}
  }
  console.log(fallos?'\nRESULTADO: '+fallos+' fallo(s)':'\nRESULTADO: todo correcto');process.exit(fallos?1:0);
})();
