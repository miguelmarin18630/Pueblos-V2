#!/usr/bin/env node
/* Comprueba que la lista de «Buscar» respeta el botón Relieve (buscarVisible) y que
   decide lo mismo que la cámara: el horizonte por rayos de 2,5° del panorama.
   Uso:  node tests/busqueda.js   (desde la raíz del proyecto o desde tests/)
   Usa el relieve real (data/relieve.bin) y los pueblos de data/pueblos.js. */
'use strict';
process.chdir(require('path').resolve(__dirname,'..'));
const fs=require('fs');
const src=fs.readFileSync('scripts/app.js','utf8').replace(/\r/g,'');
function extraer(nombre){const i=src.indexOf('function '+nombre+'(');let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1)}}}
const DS=[0.3,0.6,1,1.5,2,2.5,3,4,5,6,7,8,9,10,12,14,16,18,20,23,26,29,32,35,40,48,56,64,72,80];
(async()=>{
  const buf=fs.readFileSync('data/relieve.bin');
  const r=await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
  const hl=new DataView(r).getUint32(0,true),hdr=JSON.parse(new TextDecoder().decode(new Uint8Array(r,4,hl)));
  const base=4+hl;let total=0;hdr.b.forEach(k=>total+=k.r*k.c);
  const lo=new Uint8Array(r,base,total),hi=new Uint8Array(r,base+total,total);let off=0,bl=[];
  hdr.b.forEach(k=>{const d=new Int16Array(k.r*k.c);for(let y=0;y<k.r;y++){let p=0;const o=off+y*k.c;for(let x=0;x<k.c;x++){p=(p+((hi[o+x]<<8)|lo[o+x]))<<16>>16;d[y*k.c+x]=p}}off+=k.r*k.c;bl.push({n:k.n,w:k.w,r:k.r,c:k.c,d})});
  const ctx=`var usarRelieve=true,pos=null,cacheV={},DEMLOC={s:${hdr.s},b:BL},BUSCAR_KM=80,R=Math.PI/180,visBusc={},horRayos={},horClave="";
function clave(p){return p.n}
var DS=${JSON.stringify(DS)};
function nJ(a){var n=0;while(n<DS.length&&DS[n]<=a+0.001)n++;return n}
function brg(a,b,c,d){var L=(d-b)*R,y=Math.sin(L)*Math.cos(c*R),x=Math.cos(a*R)*Math.sin(c*R)-Math.sin(a*R)*Math.cos(c*R)*Math.cos(L);return (Math.atan2(y,x)/R+360)%360}
${extraer('elevLocal')}
${extraer('horizonteH0')}
${extraer('rayoHorizonte')}
${extraer('buscarVisible')}
return {buscarVisible,set:function(o){usarRelieve=o},demNull:function(){DEMLOC=null},elev:elevLocal}`;
  const api=new Function('BL',ctx)(bl);
  const rad=Math.PI/180;
  const dst=(a,b,c,d)=>{const dl=(c-a)*rad,dn=(d-b)*rad;const x=Math.sin(dl/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dn/2)**2;return 12742*Math.asin(Math.sqrt(x))};
  const brg=(a,b,c,d)=>{const L=(d-b)*rad,y=Math.sin(L)*Math.cos(c*rad),x=Math.cos(a*rad)*Math.sin(c*rad)-Math.sin(a*rad)*Math.cos(c*rad)*Math.cos(L);return (Math.atan2(y,x)/rad+360)%360};
  const envolver=x=>((x%360)+540)%360-180;
  const datos=fs.readFileSync('data/pueblos.js','utf8').match(/"(.*)"/s)[1].split('\\n').map(l=>l.split('|')).filter(a=>a.length>=4).map(a=>({la:+a[0],lo:+a[1],n:a[2],t:a[3]}));

  // Panorama de la cámara: 37 rayos de 2,5° alrededor del rumbo, escalera DS y máximo acumulado
  function panorama(la,lon,c){
    const H0=api.elev(la,lon)+2,nj=nJ(80),M=[];
    for(let k=0;k<37;k++){
      const az=(c-45+k*2.5+360)%360,fila=[];let m=-9;
      for(let j=0;j<nj;j++){
        const d=DS[j],v=api.elev(la+d*Math.cos(az*rad)/111.32,lon+d*Math.sin(az*rad)/(111.32*Math.cos(la*rad)));
        const dm=d*1000,ang=Math.atan2((v===null?0:v)-H0-dm*dm/14.6e6,dm);
        if(ang>m)m=ang;fila.push(m);
      }
      M.push(fila);
    }
    return {la,lon,H0,M,c};
  }
  function nJ(a){let n=0;while(n<DS.length&&DS[n]<=a+0.001)n++;return n}
  function panVisible(pan,p){
    const az=brg(pan.la,pan.lon,p.la,p.lo),dk=dst(pan.la,pan.lon,p.la,p.lo);
    if(dk>80||dk<0.4)return true;
    const f=(envolver(az-pan.c)+45)/2.5;
    if(f<0||f>36)return null; // fuera del panorama: la cámara no opina
    const i=Math.floor(f),i2=Math.min(i+1,36),t=f-i,j=nJ(dk)-1;
    if(j<0)return true;
    const e=api.elev(p.la,p.lo),dm=dk*1000;
    const occ=pan.M[i][j]*(1-t)+pan.M[i2][j]*t;
    return Math.atan2((e===null?0:e)+10-pan.H0-dm*dm/14.6e6,dm)>=occ-0.004;
  }

  let fallos=0,comp=0,falsos=0,ocultos=0;
  for(const [nom,la,lon] of [['Granada',37.1773,-3.5986],['Madrid',40.4168,-3.7038],['Bilbao',43.263,-2.935],['Pamplona',42.8125,-1.6458],['Santander',43.4623,-3.8099]]){
    const P0={latitude:la,longitude:lon};
    const cer=datos.map(p=>({...p,k:dst(la,lon,p.la,p.lo)})).filter(p=>p.k<=80&&p.k>0.4&&p.t!=='peak');
    let t0=Date.now(),vis=0,oc=[];
    for(const p of cer){if(api.buscarVisible(P0,p))vis++;else oc.push(p)}
    const ms=Date.now()-t0;
    console.log(`${nom}: ${cer.length} lugares <80 km → ${vis} visibles, ${oc.length} tapados (${ms} ms)`);
    const ej=oc.slice(0,4).map(p=>p.n+' '+p.k.toFixed(0)+'km').join(', ');
    console.log('  ejemplos tapados: '+(ej||'ninguno'));
    // La lista (40 primeros visibles, como en pantalla) debe coincidir con la cámara
    const lista=[];for(const p of cer){if(api.buscarVisible(P0,p)){lista.push(p);if(lista.length>=40)break}}
    let malos=0,ocultosMal=0;
    for(const c of [0,120,240]){
      const pan=panorama(la,lon,c);
      for(const p of lista){
        const v=panVisible(pan,p);if(v===null)continue;
        comp++;
        if(v===false){malos++;falsos++;if(malos<=3)console.log(`  FALLO: la cámara tapa ${p.n} (${p.k.toFixed(1)} km) y la lista lo muestra`)}
        if(v===true&&!api.buscarVisible(P0,p)){ocultosMal++;ocultos++;if(ocultosMal<=3)console.log(`  FALLO: la cámara ve ${p.n} y la lista lo oculta`)}
      }
    }
    console.log(`  cámara: ${comp} comparaciones · falsos visibles ${malos} · ocultos por error ${ocultosMal}`);
    api.set(false);const sinRel=cer.every(p=>api.buscarVisible(P0,p));api.set(true);
    console.log('  con Relieve apagado se muestran todos:',sinRel);
    if(!sinRel||oc.length===0||vis===0||malos||ocultosMal){fallos++;console.log('  FALLO')}
  }
  console.log(`\ncomparaciones con la cámara: ${comp} · falsos visibles ${falsos} · ocultos por error ${ocultos}`);
  console.log(fallos?'\nRESULTADO: '+fallos+' fallo(s)':'\nRESULTADO: todo correcto');process.exit(fallos?1:0);
})();
