/* ============================================================
   ¿Qué pueblo es? - motor de la app (v2, modular)
   - Geometria y utilidades
   - Camara, brujula, calibracion, relieve y etiquetas
   - Datos: data/pueblos.js (siempre) y data/picos.js (al activar picos)
   Los datos son de OpenStreetMap (ODbL). El relieve se consulta a
   Open-Meteo, o se lee del bloque #datosRelieve si existe.
   ============================================================ */
(function(){
"use strict";
// [nombre, lat, lon] — localidades de España (aprox.)
var BASE=[["Madrid",40.417,-3.704],["Barcelona",41.387,2.170],["Valencia",39.470,-0.376],["Sevilla",37.389,-5.984],["Zaragoza",41.649,-0.887],["Málaga",36.721,-4.421],["Murcia",37.992,-1.131],["Palma",39.570,2.650],["Bilbao",43.263,-2.935],["Alicante",38.346,-0.483],["Córdoba",37.888,-4.779],["Valladolid",41.652,-4.724],["Vigo",42.240,-8.721],["Gijón",43.532,-5.661],["A Coruña",43.362,-8.411],["Granada",37.177,-3.599],["Vitoria",42.847,-2.673],["Elche",38.267,-0.698],["Oviedo",43.361,-5.849],["Cartagena",37.600,-0.986],["Jerez de la Frontera",36.686,-6.137],["Pamplona",42.812,-1.645],["Almería",36.834,-2.464],["San Sebastián",43.318,-1.981],["Burgos",42.344,-3.697],["Santander",43.462,-3.810],["Castellón",39.986,-0.037],["Albacete",38.995,-1.859],["Logroño",42.466,-2.445],["Badajoz",38.879,-6.970],["Salamanca",40.970,-5.664],["Huelva",37.261,-6.945],["Lleida",41.617,0.620],["Tarragona",41.119,1.245],["León",42.599,-5.567],["Cádiz",36.527,-6.289],["Jaén",37.779,-3.785],["Ourense",42.336,-7.864],["Girona",41.979,2.821],["Lugo",43.012,-7.556],["Cáceres",39.476,-6.372],["Toledo",39.863,-4.027],["Ciudad Real",38.986,-3.927],["Guadalajara",40.633,-3.167],["Cuenca",40.070,-2.137],["Segovia",40.943,-4.109],["Ávila",40.656,-4.700],["Soria",41.764,-2.469],["Teruel",40.345,-1.107],["Huesca",42.140,-0.408],["Palencia",42.010,-4.531],["Zamora",41.503,-5.744],["Pontevedra",42.431,-8.644],["Santiago de Compostela",42.878,-8.544],["Ronda",36.742,-5.167],["Marbella",36.510,-4.886],["Antequera",37.019,-4.561],["Úbeda",38.013,-3.370],["Baeza",37.994,-3.470],["Guadix",37.300,-3.140],["Motril",36.745,-3.518],["Lorca",37.671,-1.701],["Benidorm",38.538,-0.131],["Dénia",38.841,0.106],["Gandía",38.968,-0.181],["Sagunto",39.680,-0.278],["Xàtiva",38.990,-0.520],["Alcoy",38.705,-0.474],["Aranjuez",40.031,-3.603],["Alcalá de Henares",40.482,-3.364],["Talavera de la Reina",39.963,-4.831],["Mérida",38.916,-6.343],["Plasencia",40.030,-6.088],["Peñíscola",40.358,0.408],["Morella",40.620,-0.100],["Albarracín",40.408,-1.442],["Calatayud",41.353,-1.643],["Tortosa",40.812,0.521],["Reus",41.156,1.107],["Vic",41.930,2.255],["Figueres",42.267,2.961],["Manresa",41.730,1.826],["Andújar",38.039,-4.051],["Linares",38.095,-3.636],["Lucena",37.409,-4.485],["Écija",37.542,-5.082],["Carmona",37.471,-5.646],["Algeciras",36.133,-5.455],["Tarifa",36.014,-5.606],["Sanlúcar de Barrameda",36.778,-6.352],["Vélez-Málaga",36.775,-4.100],["Nerja",36.745,-3.875],["Baza",37.490,-2.771],["Loja",37.168,-4.150],["Órgiva",36.900,-3.425],["Mojácar",37.139,-1.851]];
var P=BASE.slice();
// Une una lista detallada (OSM o base local) con la lista básica. Una ciudad básica solo se descarta
// si ya hay una localidad con el mismo nombre a menos de ~5 km (así no se pierden pueblos homónimos lejanos).
function fusionar(det,base){
  var idx={};det.forEach(function(p){(idx[p[0]]=idx[p[0]]||[]).push(p)});
  return det.concat(base.filter(function(b){return !(idx[b[0]]||[]).some(function(o){return Math.abs(o[1]-b[1])<0.045&&Math.abs(o[2]-b[2])<0.06})}));
}
var TOL=3,pos=null,ultimaPos=null,hd=0,sm=null;
// Margen angular de la mira. Si la brujula declara su error (webkitCompassAccuracy,
// en grados) se ajusta a el; si no, se queda en 3°, el margen de siempre.
function tolMira(){
  if(typeof prec!=="number"||!isFinite(prec)||prec<0||prec>25)return TOL;
  return Math.max(1.5,Math.min(TOL,1+0.25*prec));
}
// Orden de los candidatos de la mira: manda el angulo. La distancia solo desempata
// dentro del mismo cuarto de grado, para que un pueblo lejano a 0,2° gane a uno
// cercano a 0,3° (antes se sumaba 0,04° por km y ganaba siempre el de al lado).
function cmpMira(a,b){var ca=Math.round(a.d*4),cb=Math.round(b.d*4);return (ca-cb)||(a.k-b.k)}
// Índice espacial: cuadrícula de 0,1° que se recalcula solo cuando P cambia de lista
var GRID=0.1,gridP=null,gridM=null;
function gridKey(i,j){return i*4000+j}
function enRecuadro(la,lo,dLa,dLo){
  if(gridP!==P){
    gridM=new Map();
    for(var n=0;n<P.length;n++){var q=P[n],k=gridKey(Math.floor(q[1]/GRID),Math.floor(q[2]/GRID)),c=gridM.get(k);if(c)c.push(q);else gridM.set(k,[q])}
    gridP=P;
  }
  var out=[],i0=Math.floor((la-dLa)/GRID),i1=Math.floor((la+dLa)/GRID),j0=Math.floor((lo-dLo)/GRID),j1=Math.floor((lo+dLo)/GRID),i,j,c,n;
  for(i=i0;i<=i1;i++)for(j=j0;j<=j1;j++){c=gridM.get(gridKey(i,j));if(c)for(n=0;n<c.length;n++)out.push(c[n])}
  return out; // candidatos de las celdas tocadas: quien llama aplica su filtro exacto
}
var $=function(i){return document.getElementById(i)};
var R=Math.PI/180;
function brg(a,b,c,d){var L=(d-b)*R,y=Math.sin(L)*Math.cos(c*R),x=Math.cos(a*R)*Math.sin(c*R)-Math.sin(a*R)*Math.cos(c*R)*Math.cos(L);return (Math.atan2(y,x)/R+360)%360}
function dst(a,b,c,d){var p=(c-a)*R,q=(d-b)*R,h=Math.sin(p/2)*Math.sin(p/2)+Math.cos(a*R)*Math.cos(c*R)*Math.sin(q/2)*Math.sin(q/2);return 12742*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))}
function dif(a,b){return Math.abs(((a-b+540)%360)-180)}
function esc(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML}

var cacheV={},enCurso={},sinRelK={},pit=0,ocho8=false;
var visCache={},visUso={},gV=0;
try{visCache=JSON.parse(localStorage.getItem("vis")||"{}");if(!visCache||typeof visCache!=="object")visCache={}}catch(e){visCache={}}
Object.keys(visCache).forEach(function(k){cacheV[k]=visCache[k]});
function guardarVis(fuerza){
  if(!fuerza&&Date.now()-gV<5000)return;
  gV=Date.now();
  var ks=Object.keys(visCache);
  if(ks.length>2500){
    // fuera las 500 menos usadas (el sort es estable: a igualdad se va primero la más antigua)
    ks.sort(function(a,b){return (visUso[a]||0)-(visUso[b]||0)});
    ks.slice(0,500).forEach(function(k){delete visCache[k];delete cacheV[k];delete visUso[k]});
  }
  try{localStorage.setItem("vis",JSON.stringify(visCache))}catch(e){}
}
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")guardarVis(true)});
var SZ={city:40,town:36,village:32,hamlet:28,isolated_dwelling:24},SZL={city:19,town:17,village:15,hamlet:13,isolated_dwelling:12};
function clave(p){var g=modoCoche?0.03:0.01;return p.n+p.la.toFixed(3)+p.lo.toFixed(3)+"|"+Math.round(pos.latitude/g)+","+Math.round(pos.longitude/g)+"|"+Math.round((pos.altitude||0)/300)}
// Altitudes del terreno: Open-Meteo. Guarda el motivo si no hay datos.
var errRel="";
// fetch con tiempo máximo: si la red se cuelga, no se bloquean la cola ni el panorama
function fetchT(u,o,ms){
  o=o||{};var c=typeof AbortController!=="undefined"?new AbortController():null;if(c)o.signal=c.signal;
  var t=setTimeout(function(){if(c)c.abort()},ms||15000);
  return fetch(u,o).finally(function(){clearTimeout(t)});
}
function valida(h,n){return h&&h.length===n&&h.every(function(x){return typeof x==="number"&&isFinite(x)})}
var bloqRel=0;
var omUso=[];
// Open-Meteo cuenta cada coordenada como una llamada (máx. 600 por minuto): llevo la cuenta y me quedo por debajo
function omLibres(){var t=Date.now();omUso=omUso.filter(function(e){return t-e[0]<60000});return Math.max(0,520-omUso.reduce(function(s,e){return s+e[1]},0))}
// Deja libre este cupo para las altitudes de las etiquetas (se piden después del panorama)
var RESERVA_ELEV=100;
function omCupo(n){return omLibres()>=n}
async function viaOM(lats,lons){
  var r=await fetchT("https://api.open-meteo.com/v1/elevation?latitude="+lats.join(",")+"&longitude="+lons.join(","));
  var j=await r.json();
  if(valida(j.elevation,lats.length))return{h:j.elevation,f:"Open-Meteo"};
  throw new Error(j.reason||("error "+r.status));
}
// Nota: OpenTopoData se quito como respaldo porque su API no envia cabeceras CORS
// y el navegador bloquea la peticion. Open-Meteo es el unico proveedor remoto.
// ---- Relieve incluido en la página (opcional) ----
// Si existe el bloque «datosRelieve» (lo genera generar_relieve.py), las altitudes se leen de ahí y no se descarga nada.
// Formato: zlib( [4 bytes: largo de cabecera][cabecera JSON][bytes bajos][bytes altos] ), alturas en int16 con diferencias por filas.
var DEMLOC=null,demLocalP=null;
function cargarRelieveLocal(){
  var el=document.getElementById("datosRelieve");
  if(!el||!el.textContent.trim()||typeof DecompressionStream==="undefined")return null;
  return (async function(){
    try{
      var b=atob(el.textContent.trim()),u=new Uint8Array(b.length),i;
      for(i=0;i<b.length;i++)u[i]=b.charCodeAt(i);
      el.textContent="";
      var r=await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer();
      var hl=new DataView(r).getUint32(0,true),hdr=JSON.parse(new TextDecoder().decode(new Uint8Array(r,4,hl)));
      var base=4+hl,total=0;hdr.b.forEach(function(k){total+=k.r*k.c});
      var lo=new Uint8Array(r,base,total),hi=new Uint8Array(r,base+total,total),off=0,bl=[];
      hdr.b.forEach(function(k){
        var d=new Int16Array(k.r*k.c),y,x,p,o;
        for(y=0;y<k.r;y++){p=0;o=off+y*k.c;for(x=0;x<k.c;x++){p=(p+((hi[o+x]<<8)|lo[o+x]))<<16>>16;d[y*k.c+x]=p}}
        off+=k.r*k.c;bl.push({n:k.n,w:k.w,r:k.r,c:k.c,d:d});
      });
      DEMLOC={s:hdr.s,b:bl};
    }catch(e){DEMLOC=null}
  })();
}
// Altura en (la,lo) por interpolación entre las 4 celdas más cercanas; null si el punto queda fuera del relieve incluido
function elevLocal(la,lo){
  if(!DEMLOC)return null;
  for(var q=0;q<DEMLOC.b.length;q++){
    var k=DEMLOC.b[q],s=DEMLOC.s,fi=(k.n-la)/s-0.5,fj=(lo-k.w)/s-0.5;
    if(fi<-0.5||fj<-0.5||fi>k.r-0.5||fj>k.c-0.5)continue;
    fi=Math.min(Math.max(fi,0),k.r-1);fj=Math.min(Math.max(fj,0),k.c-1);
    var i=Math.min(Math.floor(fi),k.r-2),j=Math.min(Math.floor(fj),k.c-2),ty=fi-i,tx=fj-j,d=k.d,c=k.c;
    var a=d[i*c+j],b=d[i*c+j+1],e=d[(i+1)*c+j],f=d[(i+1)*c+j+1];
    return Math.round((a*(1-tx)+b*tx)*(1-ty)+(e*(1-tx)+f*tx)*ty);
  }
  return null;
}
demLocalP=cargarRelieveLocal();
// Todos los pedidos van a Open-Meteo; omLibres() reparte el cupo por minuto.
async function altitudes(lats,lons){
  if(demLocalP)await demLocalP;
  if(DEMLOC){
    var hl=[],okl=true;
    for(var il=0;il<lats.length;il++){var vl=elevLocal(parseFloat(lats[il]),parseFloat(lons[il]));if(vl===null){okl=false;break}hl.push(vl)}
    if(okl){errRel="";return{h:hl,f:"relieve incluido"}}
  }
  if(Date.now()<bloqRel)return null;
  var n=lats.length;
  try{
    if(!omCupo(n))throw new Error("cupo por minuto agotado");
    omUso.push([Date.now(),n]);
    var a=await viaOM(lats,lons);
    errRel="";return a;
  }catch(e){
    var m=e&&e.message||"";
    errRel="Open-Meteo: "+motivoErr(e);
    // El límite por hora (5000) no se recupera en segundos: no insistas cada medio minuto
    bloqRel=Date.now()+(/hourly/i.test(m)?600000:25000);
    return null;
  }
}
var fuenteRel="";
// Comprueba si el pueblo p se ve desde aquí: relieve + curvatura de la Tierra (con refracción)
var colaV=[],activosV=0;
function verificar(p){
  var k=clave(p);
  if(enCurso[k]||cacheV[k]!==undefined)return;
  enCurso[k]=2;
  colaV.push({p:p,k:k});
  while(colaV.length>6){var x=colaV.shift();delete enCurso[x.k]}
  sigueCola();
}
function sigueCola(){
  while(activosV<3&&colaV.length){
    var x=colaV.shift();activosV++;
    verificarReal(x.p,x.k).then(function(){activosV--;sigueCola()},function(){activosV--;sigueCola()});
  }
}
async function verificarReal(p,k){
  if(!pos){delete enCurso[k];return}
  enCurso[k]=1;
  var la=pos.latitude,lo=pos.longitude,D=p.k*1000;
  var n=Math.max(6,Math.min(60,Math.ceil(p.k/1.5)));
  var lats=[],lons=[],ds=[],i;
  for(i=0;i<=n;i++){var f=i/n;lats.push((la+(p.la-la)*f).toFixed(5));lons.push((lo+(p.lo-lo)*f).toFixed(5));ds.push(D*f)}
  var al=await altitudes(lats,lons);
  if(!pos){delete enCurso[k];return}
  var rel=!!al,h,H0,H1,gps=pos.altitude;
  if(rel){
    h=al.h;fuenteRel=al.f;
    // Solo uso la altitud del GPS si claramente estoy muy por encima del suelo (avión, cumbre)
    H0=(typeof gps==="number"&&gps>h[0]+150)?gps:h[0]+2;
    H1=h[n]+10;
  }else{
    // Sin datos de relieve no puedo saber si hay montañas: solo curvatura y solo lo cercano
    h=[];for(i=0;i<=n;i++)h.push(0);
    H0=(typeof gps==="number"&&gps>2500)?gps:2;
    H1=10;
  }
  if(rel)delete sinRelK[k];else sinRelK[k]=true;
  var RT=7300000,ok=true;
  for(i=1;i<n;i++){
    var d=ds[i],bulto=d*(D-d)/(2*RT);
    if(h[i]+bulto>H0+(H1-H0)*d/D){ok=false;break}
  }
  if(!rel&&p.k>10)ok=false;
  cacheV[k]=ok;
  delete enCurso[k];
  if(rel){visCache[k]=ok;visUso[k]=Date.now();guardarVis()}
  else setTimeout(function(){delete cacheV[k];delete sinRelK[k]},30000);
  pintar();
}
var ochoActivo=false;
function actOcho(){
  var t=$("ochot");
  if(prec===null){t.textContent="Tu móvil no informa de la precisión, así que no puedo comprobar si el 8 ha funcionado. Dibújalo unos 10 segundos; para estar seguro, calibra también con un lugar que veas.";return}
  if(prec<0){t.textContent="Brújula sin calibrar. Sigue dibujando el 8 en el aire girando la muñeca…";return}
  if(prec<=10)ocho8=true;
  t.textContent=(prec<=10?"✓ Brújula calibrada. Ya puedes pulsar «Listo». ":"Sigue dibujando el 8… ")+"Precisión: ±"+Math.round(prec)+"°"+(prec<=10?"":" (objetivo: ±10° o menos)");
}
function cerrarOcho(){ochoActivo=false}
// Cuenta localidades a menos de km (en cualquier dirección o solo en la que apunta el móvil)
function contarPueblos(pe,hdc,km,soloDir){
  var dLa=km/111,dLo=km/(111*Math.max(0.2,Math.cos(pe.latitude*R))),n=0,i,p,k;
  var cand=enRecuadro(pe.latitude,pe.longitude,dLa,dLo);
  for(i=0;i<cand.length;i++){
    p=cand[i];
    if(Math.abs(p[1]-pe.latitude)>=dLa||Math.abs(p[2]-pe.longitude)>=dLo)continue;
    k=dst(pe.latitude,pe.longitude,p[1],p[2]);
    if(k<=0.5||k>km)continue;
    if(soloDir&&dif(brg(pe.latitude,pe.longitude,p[1],p[2]),hdc)>tolMira())continue;
    n++;
  }
  return n;
}
// Explica por qué no sale ningún pueblo y qué probar (se calcula solo si cambia la situación)
var spC={k:"",t:""};
function sinPueblos(pe,hdc,r){
  if(r.length)return "Hay pueblos en esa dirección, pero el relieve (las montañas) los tapa desde aquí. Prueba a apuntar un poco hacia un lado.";
  var k=[pe.latitude.toFixed(2),pe.longitude.toFixed(2),Math.round(hdc/3),alcance,verAldeas?1:0,P.length].join("|");
  if(spC.k===k)return spC.t;
  var t;
  if(!BD&&P.length<=BASE.length){
    t="No tengo los pueblos de esta zona.";
  }else if(!contarPueblos(pe,hdc,alcance,false)){
    t="No tengo pueblos a menos de "+alcance+" km de aquí.";
    if(alcance<80&&contarPueblos(pe,hdc,80,false)>0)t+=" Prueba con «Más lejos» (80 km).";
  }else if(!contarPueblos(pe,hdc,alcance,true)){
    t="No hay pueblos en esa dirección a menos de "+alcance+" km."+((alcance<80&&contarPueblos(pe,hdc,80,true)>0)?" Prueba con «Más lejos» (80 km) o gira hacia otro lado.":" Gira hacia otro lado.");
  }else t=verAldeas?"No veo ningún pueblo en esa dirección.":"Solo hay aldeas en esa dirección: activa «Aldeas» para verlas.";
  spC={k:k,t:t};return t;
}
// Indicadores de estado siempre visibles: GPS, brújula y calibración
var estC="";
function actualizarEstado(){
  var g,b,c,a;
  if(pos&&typeof pos.accuracy==="number"){a=pos.accuracy;g=a<=30?["ok","GPS ✓"]:a<=100?["av","GPS ⚠ ±"+Math.round(a)+" m"]:["mal","GPS ✕ ±"+Math.round(a)+" m"]}
  else g=["n","GPS …"];
  if(oriN>20&&!oriNorte)b=["mal","Brújula ✕ no fiable"];
  else if(oriN===0)b=(oriT0&&Date.now()-oriT0>4000)?["mal","Brújula ✕ sin datos"]:["n","Brújula …"];
  else if(prec!==null&&prec<0)b=["mal","Brújula ✕ haz el 8"];
  else if(prec!==null&&prec>20)b=["av","Brújula ⚠ ±"+Math.round(prec)+"°"];
  else b=["ok","Brújula ✓"+(prec!==null?" ±"+Math.round(prec)+"°":"")];
  if(prec!==null&&(prec<0||prec>20))ocho8=false;
  // Verde si la brújula está bien (calibrada, o precisa sin necesidad de calibrar); ámbar «Sin calibrar» si hace falta; gris si el móvil no informa de la precisión
  var calOk=!!(off||Object.keys(tab).length||ocho8),imprecisa=prec!==null&&(prec<0||prec>20);
  c=calOk?["ok","Calibrada ✓"]:imprecisa?["av","Sin calibrar"]:prec!==null?["ok","Calibración ✓"]:["n","Calibración …"];
  var k=g.join()+b.join()+c.join();
  if(k===estC)return;
  estC=k;
  [["eGps",g],["eBrj",b],["eCal",c]].forEach(function(x){var e=$(x[0]);e.className="ch "+x[1][0];e.textContent=x[1][1]});
}
actAldeasBtn();
var rafP=0;
// Agrupa todas las peticiones de repintado en un solo dibujo por fotograma
function pintar(){
  if(rafP)return;
  rafP=requestAnimationFrame(function(){rafP=0;pintarYa()});
}
function pintarYa(){
  if(!pos){return}
  var pe=posEfectiva();
  var hdc=rumboC();
  if(!panEnCurso&&Date.now()>=panBloq&&(!pan||pan.alc!==alcance||Math.abs(envolver(hdc-pan.c))>25||dst(pan.la,pan.lo,pos.latitude,pos.longitude)>1.5||(pan.paso>1&&Date.now()-pan.t>8000&&omLibres()>120)))construirPano();
  $("rumbo").textContent="Rumbo: "+Math.round(hdc)+"° · Inclinación: "+Math.round(pit)+"°";
  actualizarEstado();
  var av=[];
  if(prec!==null){if(prec<0)av.push("Brújula sin calibrar: dibuja un 8 con el móvil.");else if(prec>20)av.push("Brújula poco precisa (±"+Math.round(prec)+"°): dibuja un 8 con el móvil.")}
  var nT=Object.keys(tab).length;
  if(off||nT)av.push("Calibrada: "+fmtOff(offPara(hd))+(nT?" ("+nT+" de 8 direcciones)":""));
  if(!modoCoche&&Date.now()-autoT<5000)av.push("Brújula afinada con el GPS ("+fmtOff(offPara(hd))+").");
  if(modoCoche)av.push("🚗 Modo coche: que lo use el acompañante."+(Date.now()-autoT<5000?" Brújula corregida con el GPS ("+fmtOff(offPara(hd))+").":""));
  if(hzAuto&&Date.now()-hzT<8000)av.push("📷 Rumbo corregido con el horizonte ("+fmtOff(hzPara(hd))+", confianza "+Math.round(hzConf*100)+"%).");
  // Sin referencia al norte (Android sin brújula absoluta) o sin datos de orientación: el rumbo no es fiable
  if(oriN>20&&!oriNorte)av.unshift("⚠ Este navegador no da el rumbo respecto al norte: los resultados pueden no ser fiables. Prueba con Chrome o Safari actualizados.");
  else if(oriN===0&&oriT0&&Date.now()-oriT0>4000)av.unshift("⚠ No llegan datos de la brújula. Comprueba que el móvil tiene brújula y que el navegador tiene permiso.");
  if(camErr)av.unshift("📷 "+camErr);
  $("brj").textContent=av.join(" ");
  var r=[],vis=null,pend=false,i,fuera=(pit<-40||pit>(verPicos?55:30));
  if(!fuera&&!verPicos){
    // Prefiltro rápido por recuadro (la base local puede tener decenas de miles de localidades y esto corre 10 veces/s)
    var dmax=alcance,dLa=dmax/111,dLo=dmax/(111*Math.max(0.2,Math.cos(pe.latitude*R))),tol=tolMira();
    r=enRecuadro(pe.latitude,pe.longitude,dLa,dLo).filter(function(p){return Math.abs(p[1]-pe.latitude)<dLa&&Math.abs(p[2]-pe.longitude)<dLo}).map(function(p){return{t:p[3]||"city",n:p[0],la:p[1],lo:p[2],d:dif(brg(pe.latitude,pe.longitude,p[1],p[2]),hdc),k:dst(pe.latitude,pe.longitude,p[1],p[2])}})
      .filter(function(p){return p.d<=tol&&p.k>0.5&&p.k<=alcance&&(verAldeas||(p.t!=="hamlet"&&p.t!=="isolated_dwelling"))&&!((p.t==="hamlet"||p.t==="isolated_dwelling")&&p.k>12)})
      .sort(cmpMira).slice(0,modoCoche?4:8);
    for(i=0;i<r.length;i++){
      var v=estadoVis(r[i]);
      if(v===true){vis=r[i];break}
      if(v===undefined){
        pend=true;lanzarVis(r[i]);
        if(i+1<r.length&&estadoVis(r[i+1])===undefined)lanzarVis(r[i+1]);
        break;
      }
    }
  }
  selVis=vis;
  // El aviso depende del pueblo mostrado (o de un fallo global reciente), no de la última consulta suelta
  var sinRel=usarRelieve?(vis?(panVis(vis)===null&&sinRelK[clave(vis)]===true):(!pan&&Date.now()<bloqRel)):false;
  $("mejor").textContent=vis?vis.n:"—";
  $("mejor").style.fontSize=Math.round(vis?(SZ[vis.t]||32)*0.8:28)+"px";
  $("lista").innerHTML=vis?'<div class="it" style="border-left-color:'+colorDe(vis)+'"><span style="font-size:'+(SZL[vis.t]||15)+'px"><b style="color:'+colorDe(vis)+'">●</b> '+esc(vis.n)+'</span><span>'+vis.k.toFixed(0)+' km · ±'+vis.d.toFixed(1)+'°</span></div>':"";
  $("msg").textContent=fuera?"Apunta hacia el horizonte con el móvil en vertical.":!usarRelieve?"Relieve desactivado: se muestran los pueblos por dirección, sin comprobar si una montaña los tapa.":vis?(sinRel?"⚠ Sin datos de relieve"+(errRel?" ("+errRel+")":"")+": solo compruebo lo cercano (menos de 10 km).":"Relieve comprobado ("+fuenteRel+")"):pend?(panEnCurso?"Descargando el relieve de la zona… "+panProg:"Comprobando visibilidad…"):(sinRel?"No veo ningún pueblo cercano. Sin datos de relieve"+(errRel?" ("+errRel+")":"")+" no puedo comprobar lo lejano.":sinPueblos(pe,hdc,r));
  $("msg").className=(!fuera&&!vis&&!pend&&!sinRel)?"aviso":"";
  if(verPicos){
    // Modo picos: el panel habla de picos, no de pueblos
    if(pos&&!pkCargando&&Date.now()>pkProx&&(!PK.length||(pkCentro&&dst(pos.latitude,pos.longitude,pkCentro.la,pkCentro.lo)>=20)))cargarPicos();
    var pm=(!fuera&&PK.length)?picoMira(pe,hdc):null;
    $("mejor").textContent=pm?"▲ "+pm.n:"—";
    $("mejor").style.fontSize=pm?"28px":"28px";
    $("lista").innerHTML=pm?'<div class="it" style="border-left-color:'+COLPK+'"><span style="font-size:17px"><b style="color:'+COLPK+'">▲</b> '+esc(pm.n)+'</span><span>'+Math.round(pm.e).toLocaleString("es-ES")+' m · '+(pm.dk<10?pm.dk.toFixed(1):Math.round(pm.dk))+' km</span></div>':"";
    $("msg").className=(pkEstado==="error"||(!fuera&&PK.length&&!pm&&pan))?"aviso":"";
    $("msg").textContent=fuera?"Baja un poco el móvil: apunta hacia la cumbre, no al cielo.":
      pkEstado==="cargando"&&!PK.length?"Descargando los picos de tu zona (radio de 80 km)…":
      pkEstado==="error"&&!PK.length?"No pude descargar los picos (sin conexión o servidor ocupado). Reintentando…":
      !PK.length?"Aún no hay picos cargados.":
      !pan?"Descargando el relieve de la zona… "+panProg:
      pm?PK.length+" picos cargados · alcance "+alcance+" km":
      "Ningún pico en la mira (hasta "+alcance+" km). Prueba a girar o pulsa «Más lejos».";
  }
  if(document.body.classList.contains("on")&&!fuera)etiquetas(pe,hdc);else limpiarEtq();
  dibujarSilueta(hdc);
  if(invActivo)pintarInv();
  if(ochoActivo)actOcho();
}
// ---- Rumbo: filtro One-Euro ----
// Antes: media movil fija (alpha 0,2), que suavizaba igual estando parado que girando:
// dejaba 0,68° de temblor parado y 5,8° de retraso a 90°/s. Con One-Euro el corte sube
// con la velocidad real del giro, asi que filtra mas parado y casi nada al girar.
// Constantes medidas con una simulacion del sensor (tests/rumbo.js): 0,11° y 1,5°.
// El salto aislado de mas de OEF_SALTO grados se descarta salvo que la muestra
// siguiente lo confirme: asi una interferencia magnetica no arrastra el rumbo.
var OEF_MIN=1.5,OEF_BETA=0.10,OEF_DCUT=1.0,OEF_SALTO=15,OEF_CONF=8,OEF_HUECO=0.3;
var smRaw=null,smDx=0,smT=0,smPend=null;
function setH(n){
  n=((n%360)+360)%360;
  var t=Date.now();
  if(sm===null||smRaw===null){
    sm=n;smRaw=n;smDx=0;smT=t;smPend=null;hd=n;
  }else{
    var dt=(t-smT)/1000;smT=t;
    if(dt>OEF_HUECO){
      // Hueco largo (pantalla apagada, pestaña en segundo plano): no hay nada que filtrar
      sm=n;smRaw=n;smDx=0;smPend=null;hd=n;
    }else{
      dt=Math.max(1/240,dt);
      var d=((n-sm+540)%360)-180;
      if(Math.abs(d)>OEF_SALTO){
        if(smPend===null||Math.abs(((n-smPend+540)%360)-180)>=OEF_CONF){smPend=n}
        else{sm=n;smRaw=n;smDx=0;smPend=null;hd=sm}
      }else{
        smPend=null;
        var dRaw=((n-smRaw+540)%360)-180;smRaw=n;
        var aD=1/(1+1/(2*Math.PI*OEF_DCUT*dt));
        smDx=aD*(dRaw/dt)+(1-aD)*smDx;
        var cut=OEF_MIN+OEF_BETA*Math.abs(smDx);
        var a=1/(1+1/(2*Math.PI*cut*dt));
        sm=(sm+a*d+360)%360;hd=sm;
      }
    }
  }
  if(t-tp>100){tp=t;pintar()}
}
var oriAbs=false,oriN=0,oriNorte=false,oriT0=0;
function onOri(e){
  // Hay navegadores sin sensor que disparan los eventos con valores vacíos: esos no cuentan
  var hayDatos=typeof e.webkitCompassHeading==="number"||(typeof e.alpha==="number"&&typeof e.beta==="number"&&typeof e.gamma==="number");
  if(!hayDatos)return;
  oriN++;
  var abs=e.type==="deviceorientationabsolute"||e.absolute===true;
  if(typeof e.webkitCompassHeading==="number"||abs)oriNorte=true;
  if(typeof e.beta==="number")pit=e.beta-90;
  if(typeof e.webkitCompassAccuracy==="number")prec=e.webkitCompassAccuracy;
  if(typeof e.webkitCompassHeading==="number"){setH(e.webkitCompassHeading);return}
  // Android: si hay evento absoluto con datos, ignoro el relativo (su alpha no apunta al norte y mezclarlos hace saltar el rumbo)
  if(abs)oriAbs=true;
  else if(oriAbs)return;
  var a=e.alpha*R,b=e.beta*R,g=e.gamma*R;
  var rA=-Math.cos(a)*Math.sin(g)-Math.sin(a)*Math.sin(b)*Math.cos(g);
  var rB=-Math.sin(a)*Math.sin(g)+Math.cos(a)*Math.sin(b)*Math.cos(g);
  setH((Math.atan2(rA,rB)/R+360)%360);
}
var cargando=false,ultimo=null,intento=0;
// ¿Hay pueblos descargados alrededor? (al menos 3 a menos de 20 km)
function cercaBD(la,lo){
  var n=0,dLa=20/111,dLo=20/(111*Math.max(0.2,Math.cos(la*R)));
  for(var i=0;i<BD.length;i++){var p=BD[i];if(Math.abs(p[1]-la)<dLa&&Math.abs(p[2]-lo)<dLo&&dst(la,lo,p[1],p[2])<=20&&++n>=3)return true}
  return false;
}
async function masPueblos(){
  if(BD){
    if(!BDlisto){P=unir();BDlisto=true}
    // Dentro de la base incluida (o sin conexión) basta la base local; fuera de ellas, pido a OpenStreetMap
    if(cercaBD(pos.latitude,pos.longitude)||navigator.onLine===false){ultimo={la:pos.latitude,lo:pos.longitude};return}
  }
  if(cargando||Date.now()-intento<15000)return;
  cargando=true;intento=Date.now();
  // Prueba varios servidores y radios hasta que uno responda
  var intentos=[["https://overpass-api.de/api/interpreter",80000,"city|town|village|hamlet"],["https://overpass.kumi.systems/api/interpreter",80000,"city|town|village|hamlet"],["https://overpass-api.de/api/interpreter",30000,"city|town|village"]];
  var ok=false;
  for(var t=0;t<intentos.length&&!ok;t++){
    try{
      var q='[out:json][timeout:30];(node["place"~"'+intentos[t][2]+'"]["name"](around:'+intentos[t][1]+','+pos.latitude+','+pos.longitude+');'+(t<2?'node["place"="isolated_dwelling"]["name"](around:20000,'+pos.latitude+','+pos.longitude+');':'')+');out;';
      var resp=await fetchT(intentos[t][0],{method:"POST",body:"data="+encodeURIComponent(q)},40000);
      var j=await resp.json();
      if(!j.elements)throw 0;
      ultimo={la:pos.latitude,lo:pos.longitude};
      P=fusionar(j.elements.filter(function(e){return e.tags&&e.tags.name}).map(function(e){return[e.tags.name,e.lat,e.lon,e.tags.place]}),unir());
      ok=true;
    }catch(e){}
  }
  $("info").textContent=ok?"Datos: "+P.length+" localidades cargadas (OpenStreetMap"+(BD?" + base local":"")+")":BD?"Fuera de la base incluida y sin respuesta de OpenStreetMap: solo uso los pueblos que ya tengo.":"Datos: solo "+P.length+" localidades de la lista básica (no se pudo usar OpenStreetMap)";
  cargando=false;
}
var camBusy=false,camErr="",camSes=0;
function mensajeCamara(e){
  var n=e&&e.name?e.name:"";
  if(n==="NotAllowedError"||n==="SecurityError")return "Cámara sin permiso. Actívala en Ajustes > Apps > ¿Qué pueblo es? > Permisos > Cámara y vuelve a la app.";
  if(n==="NotFoundError"||n==="OverconstrainedError")return "No se encuentra ninguna cámara en este dispositivo.";
  if(n==="NotReadableError"||n==="AbortError")return "La cámara la está usando otra aplicación. Ciérrala e inténtalo de nuevo.";
  if(n==="NoApi")return "Este navegador no permite usar la cámara.";
  return "No se pudo abrir la cámara"+(n?" ("+n+")":"")+".";
}
async function camara(keep){
  if(camBusy)return;camBusy=true;var ses=camSes;
  // Cámara trasera de fondo, para ver hacia dónde apunta la mira. Si se deniega, la mira sigue funcionando.
  try{
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw {name:"NoApi"};
    var st;
    // Pide más resolución (por defecto algunos móviles dan 640x480 y al hacer zoom se ve borroso)
    try{st=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},audio:false})}
    catch(e1){st=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false})}
    // Si se pulsó «Terminar» mientras se abría la cámara, la apago en vez de dejarla encendida
    if(ses!==camSes||!document.body.classList.contains("on")){st.getTracks().forEach(function(t){t.stop()});if(ses===camSes)camBusy=false;return}
    stream=st;var v=$("cam");v.srcObject=st;v.play();
    pista=st.getVideoTracks()[0];
    var cp={};
    try{cp=pista.getCapabilities?pista.getCapabilities():{};capZoom=cp.zoom||null}catch(e){capZoom=null}
    modosFoco=cp.focusMode||[];capDist=cp.focusDistance||null;
    zMax=capZoom?capZoom.max:6;
    aplicarZoom(keep?zoom:1);
    iniciarFoco();camErr="";camBusy=false;
  }catch(e){
    if(ses!==camSes)return;
    camBusy=false;camErr=mensajeCamara(e);
    try{pintar()}catch(e2){}
  }
}

// ---- Base de datos local por provincias (IndexedDB) ----
var watchId=null,stream=null;
var BD=null,BDlisto=false,tp=0,hechas={};
// Una sola conexión reutilizada (antes se abría una por operación)
var dbP=null;
function idb(){
  if(!dbP){
    dbP=new Promise(function(res,rej){var q=indexedDB.open("pueblos",1);q.onupgradeneeded=function(){q.result.createObjectStore("kv")};q.onsuccess=function(){var d=q.result;d.onversionchange=function(){d.close();dbP=null};res(d)};q.onerror=function(){rej(q.error)}});
    dbP.catch(function(){dbP=null});
  }
  return dbP;
}
async function bdSet(k,v){var d=await idb();return new Promise(function(res,rej){var t=d.transaction("kv","readwrite");t.objectStore("kv").put(v,k);t.oncomplete=function(){res()};t.onerror=function(){rej(t.error)};t.onabort=function(){rej(t.error)}})}
async function bdGet(k){var d=await idb();return new Promise(function(res,rej){var q=d.transaction("kv").objectStore("kv").get(k);q.onsuccess=function(){res(q.result)};q.onerror=function(){rej(q.error)}})}
async function bdDel(ks){var d=await idb();return new Promise(function(res,rej){var t=d.transaction("kv","readwrite"),s=t.objectStore("kv");ks.forEach(function(k){s.delete(k)});t.oncomplete=function(){res()};t.onerror=function(){rej(t.error)}})}
// Lee solo las claves con ese prefijo (el relieve guardado no se carga al abrir la app)
async function bdAll(pre){var d=await idb();return new Promise(function(res,rej){var out={};var c=d.transaction("kv").objectStore("kv").openCursor(pre?IDBKeyRange.bound(pre,pre+"\uffff"):undefined);c.onsuccess=function(){var cur=c.result;if(cur){out[cur.key]=cur.value;cur.continue()}else res(out)};c.onerror=function(){rej(c.error)}})}
function parseLineas(txt,all){
  txt.split("\n").forEach(function(l){
    var c=l.split("|");
    if(c.length<4)return;
    var la=parseFloat(c[0]),lo=parseFloat(c[1]),pl=c[c.length-1].trim(),nom=c.slice(2,-1).join("|").trim();
    if(isNaN(la)||isNaN(lo)||!nom)return;
    all[nom+"|"+la+"|"+lo]=[nom,la,lo,pl];
  });
}
// ---- Lugares añadidos a mano o desde OpenStreetMap (se guardan en el móvil) ----

// ---- Modo inverso: buscar pueblo/pico con flechas direccionales ----
var invActivo=false, invDest=null, invTmr=null;
function llenarInvDest(){
  var sel=$("invDest");
  if(!sel)return;
  sel.innerHTML="";
  var tipos=document.getElementById("invTipo").value;
  var lista=[];
  // Pueblos de la lista actual (P) y añadidos (MIS, OSMX)
  (P||[]).forEach(function(p){if(p[3]&&p[3]!=="peak"&&(tipos==="todos"||tipos==="pueblo"))lista.push({n:p[0],la:p[1],lo:p[2],t:p[3],k:dst(pos.latitude,pos.longitude,p[1],p[2])})});
  (MIS||[]).forEach(function(p){if(tipos==="todos"||tipos==="pueblo")lista.push({n:p.n,la:p.la,lo:p.lo,t:"pueblo",k:dst(pos.latitude,pos.longitude,p.la,p.lo)})});
  (OSMX||[]).forEach(function(p){if(tipos==="todos"||tipos==="pueblo")lista.push({n:p.n,la:p.la,lo:p.lo,t:"pueblo",k:dst(pos.latitude,pos.longitude,p.la,p.lo)})});
  // Picos
  if(tipos==="todos"||tipos==="pico"){
    (PK||[]).forEach(function(p){if(p)lista.push({n:p.n,la:p.la,lo:p.lo,t:"pico",k:dst(pos.latitude,pos.longitude,p.la,p.lo),e:p.e})});
    (BASE||[]).forEach(function(p){if(p[3]==="peak")lista.push({n:p[0],la:p[1],lo:p[2],t:"pico",k:dst(pos.latitude,pos.longitude,p[1],p[2]),e:p[4]||0})});
  }
  lista.sort(function(a,b){return a.k-b.k});
  lista.forEach(function(p){
    var o=document.createElement("option");
    o.value=p.n+"|"+p.la+"|"+p.lo+"|"+p.t;
    o.textContent=(p.t==="pico"?"▲ ":"● ")+p.n+(p.k>0?" · "+(p.k<10?p.k.toFixed(1):Math.round(p.k))+" km":""));
    sel.appendChild(o);
  });
  if(!lista.length){o=document.createElement("option");o.textContent="No hay "+(tipos==="pico"?"picos":"pueblos")+" cargados";o.disabled=true;sel.appendChild(o);}
}
function activarInv(){
  if(!pos){$("invEstado").textContent="Espera a tener GPS";return}
  var sel=$("invDest");
  if(!sel.value){$("invEstado").textContent="Selecciona un destino";return}
  var partes=sel.value.split("|");
  invDest={n:partes[0],la:parseFloat(partes[1]),lo:parseFloat(partes[2]),t:partes[3]};
  $("inverso").style.display="none";
  $("invFlecha").style.display="flex";
  invActivo=true;
  $("invEstado").textContent="Buscando ""+invDest.n+""";
  pintarInv();
}
function desactivarInv(){
  invActivo=false;invDest=null;
  $("invFlecha").style.display="none";
  $("inverso").style.display="flex";
  $("invEstado").textContent="";
}
function pintarInv(){
  if(!invActivo||!invDest||!pos)return;
  var hdc=rumboC();
  var rumboDest=brg(pos.latitude,pos.longitude,invDest.la,invDest.lo);
  var difAng=((rumboDest-hdc+540)%360)-180;
  var girador=$("invFlechaGirador");
  if(girador)girador.style.transform="rotate("+difAng+"deg)";
  var dist=dst(pos.latitude,pos.longitude,invDest.la,invDest.lo);
  $("invDist").textContent=(dist<10?dist.toFixed(1):Math.round(dist))+" km";
  $("invNombre").textContent=(invDest.t==="pico"?"▲ ":"● ")+invDest.n;
  // Indicar si está alineado
  if(Math.abs(difAng)<15){
    $("invFlechaGirador").style.filter="drop-shadow(0 0 12px #22c55e)";
  } else {
    $("invFlechaGirador").style.filter="drop-shadow(0 4px 8px rgba(0,0,0,.6))";
  }
  invTmr=requestAnimationFrame(pintarInv);
}

// Integrar en pintarYa: buscar la línea que actualiza "mejor" y añadir llamada a pintarInv

var MIS=[],OSMX=[];
function leerLista(k){
  try{
    var v=JSON.parse(localStorage.getItem(k)||"[]");
    return Array.isArray(v)?v.filter(function(m){
      return m&&typeof m.n==="string"&&m.n&&isFinite(m.la)&&isFinite(m.lo);
    }):[];
  }catch(e){return[]}
}
function guardarAgregados(){
  try{
    localStorage.setItem("misLugares",JSON.stringify(MIS));
    localStorage.setItem("osmExtra",JSON.stringify(OSMX));
  }catch(e){}
}
function normNombre(n){
  return String(n||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
}
function agregados(){return MIS.concat(OSMX)}
function misPueblos(){
  return agregados().filter(function(m){return !m.pk}).map(function(m){return[m.n,m.la,m.lo,m.t||"hamlet"]});
}
function misPicos(){
  return agregados().filter(function(m){return m.pk&&isFinite(m.e)&&m.e>0}).map(function(m){return[m.n,m.la,m.lo,m.e]});
}
MIS=leerLista("misLugares");OSMX=leerLista("osmExtra");
// Une la base local, los lugares añadidos y las ciudades de la lista básica (las que no estén ya)
function unir(){return fusionar(misPueblos(),fusionar(BD||[],BASE))}
function aplicarBD(datos){
  BD=datos.length?datos:null;BDlisto=false;
  if(BD&&pos){P=unir();BDlisto=true}
  $("info").textContent=BD?"Base incluida: "+BD.length+" localidades de España":"";
}
// La base de pueblos va incluida en esta misma página (no hace falta descargar nada)
(function cargarBase(){
  var txt=window.DATOS_PUEBLOS||"",all={};
  try{
    if(txt)parseLineas(txt,all);
    aplicarBD(Object.keys(all).map(function(k){return all[k]}));
  }catch(e){}
  window.DATOS_PUEBLOS=null;
  if(!txt){
    $("info").textContent="No se pudo cargar data/pueblos.js: solo hay ciudades de la lista basica. Sirve la app por HTTP(s) o revisa la carpeta data.";
    var c=$("cargando");if(c){c.textContent="No se cargaron los pueblos (revisa data/pueblos.js).";c.className="mal"}
  }
})();
function espera(ms){return new Promise(function(r){setTimeout(r,ms)})}
function salir(){try{clearTimeout(tTap);tapSel=null;$("toque").style.display="none"}catch(e){}camErr="";camBusy=false;camSes++;iniciando=false;$("go").disabled=false;
  if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null}
  window.removeEventListener("deviceorientationabsolute",onOri,true);
  window.removeEventListener("deviceorientation",onOri,true);
  if(stream){stream.getTracks().forEach(function(t){t.stop()});stream=null}
  $("cam").srcObject=null;
  document.body.classList.remove("on");
  cerrarOcho();$("cal").style.display="none";
  $("go").style.display="";
  limpiarEtq();pan=null;hzOff=0;hzPrev=null;hzDet=null;dibujarSilueta(0);
  verPicos=false;actAldeasBtn();document.body.classList.remove("picos");$("picosb").classList.remove("act");$("picosb").setAttribute("aria-pressed","false");
  zoom=1;pista=null;capZoom=null;modosFoco=[];capDist=null;clearTimeout(tFoco);$("fdw").className="";$("cam").style.transform="";$("zval").textContent=fmtZoom(1);clearTimeout(tToast);clearTimeout(tCons);$("toast").className="";$("calbtn").classList.remove("pista");$("conf").style.display="none";
  pos=null;sm=null;smRaw=null;smDx=0;smPend=null;oriN=0;oriNorte=false;oriAbs=false;oriT0=0;modoCoche=false;velAlta=0;velBaja=0;rumboGPS=null;pantallaEncendida(false);
  $("rumbo").textContent="";$("mejor").textContent="";$("lista").innerHTML="";
  $("msg").textContent="Has terminado: cámara, GPS y brújula apagados. Pulsa «Iniciar identificación» para empezar de nuevo.";
}
// Terminar siempre pide confirmación para que un toque accidental no apague todo
function pedirTerminar(){$("conf").style.display="flex";$("confno").focus()}
$("salir").onclick=pedirTerminar;
$("confno").onclick=function(){$("conf").style.display="none"};
$("confsi").onclick=function(){$("conf").style.display="none";salir()};
document.addEventListener("keydown",function(e){if(e.key==="Escape"){$("conf").style.display="none";$("permisos").style.display="none";$("guia").style.display="none";if($("anadir").style.display==="flex")cerrarAnadir();if($("cal").style.display==="block")$("calcerrar").onclick()}});
function cerrar(){
  if(document.body.classList.contains("on"))salir();
  if(window.AndroidApp&&AndroidApp.cerrar){guardarVis(true);AndroidApp.cerrar();return} // app Android: cierra de verdad
  try{window.close()}catch(e){}
  $("adios").style.display="flex";
}
$("cerrar").onclick=cerrar;
var plegado=false;try{plegado=localStorage.getItem("plegado")==="1"}catch(e){}
function aplicarPlegado(){
  document.querySelector("main").classList.toggle("plegado",plegado);
  $("plegar").textContent=plegado?"▼":"▲";$("plegar").setAttribute("aria-expanded",plegado?"false":"true");
  pintar();
}
$("plegar").onclick=function(){plegado=!plegado;try{localStorage.setItem("plegado",plegado?"1":"0")}catch(e){}aplicarPlegado()};
aplicarPlegado();
// El botón se ve siempre. En la app Android cierra de verdad; en iPhone y navegadores una web no puede cerrarse sola,
// así que apaga cámara, GPS y brújula y muestra cómo quitar la app
function botonSalir(){$("cerrar").style.display=""}
botonSalir();window.addEventListener("load",botonSalir);
$("volver").onclick=function(){$("adios").style.display="none"};
// ---- Calibración de la brújula y filtro de aldeas ----
var off=0,verAldeas=true,prec=null,calList=[];
try{var so=parseFloat(localStorage.getItem("off"));if(!isNaN(so))off=so}catch(e){}
var tab={};
try{var st0=JSON.parse(localStorage.getItem("tab")||"{}");if(st0&&typeof st0==="object")tab=st0}catch(e){}
function guardarOff(){try{localStorage.setItem("off",String(off));localStorage.setItem("tab",JSON.stringify(tab))}catch(e){}}
function ponerTab(h,o){tab[Math.round(((h%360)+360)%360/45)%8]={o:o,n:1}}
// Corrección de brújula para el rumbo h: mezcla lo aprendido en cada dirección (0°, 45°, 90°…); lejos de lo aprendido vale el ajuste global
function offPara(h){
  var ks=Object.keys(tab);
  if(!ks.length)return off;
  var sw=0,so=0,w;
  ks.forEach(function(k){w=1/Math.pow(dif(h,k*45)+10,2);sw+=w;so+=w*tab[k].o});
  w=1/Math.pow(100,2);sw+=w;so+=w*off;
  return so/sw;
}
function maxDif(a){var m=0;for(var i=1;i<a.length;i++)m=Math.max(m,dif(a[i],a[0]));return m}
$("aldeas").onclick=function(){verAldeas=!verAldeas;this.setAttribute("aria-pressed",verAldeas?"true":"false");actAldeasBtn();pintar()};
$("calbtn").onclick=function(){
  if(!pos)return;
  calList=P.filter(function(p){return p[3]!=="hamlet"&&p[3]!=="isolated_dwelling"}).map(function(p){return{n:p[0],la:p[1],lo:p[2],k:dst(pos.latitude,pos.longitude,p[1],p[2])}}).filter(function(p){return p.k>0.5&&p.k<60}).sort(function(a,b){return a.k-b.k}).slice(0,15);
  $("calsel").innerHTML=calList.map(function(p,i){return '<option value="'+i+'">'+esc(p.n)+' · '+p.k.toFixed(0)+' km</option>'}).join("");
  calAnd=null;cal2={b:null,o:null};$("calst").textContent="";
  calVista(0);
  $("cal").style.display="block";
  ajustarMira();
};
// Menú de métodos: cada opción abre su propia vista con los pasos
// Con el panel de calibración abierto, la mira sube al centro del hueco libre para que no quede tapada.
// Solo cambia su altura en pantalla: la dirección (izquierda/derecha) sigue siendo la del centro del móvil.
function ajustarMira(){
  var cal=$("cal"),m=$("mira");
  if(cal.style.display!=="block"||cal.className==="menu"||!document.body.classList.contains("on")){m.style.top="";return}
  var topPanel=cal.getBoundingClientRect().top,hb=document.querySelector("main").getBoundingClientRect().bottom+30;
  var y=Math.min(Math.max((hb+topPanel)/2,hb+50),topPanel-50);
  if(y>hb)m.style.top=Math.round(y)+"px";else m.style.top="";
}
if(window.ResizeObserver)new ResizeObserver(ajustarMira).observe($("cal"));
window.addEventListener("resize",ajustarMira);
function calVista(v){
  ["calmenu","calv1","calv2","calv3","calv4","calv5"].forEach(function(id,i){$(id).style.display=(i===v)?"block":"none"});
  $("cal").className=v===0?"menu":"";
  ajustarMira();
  ochoActivo=(v===3);
  calAnd=null;cal2={b:null,o:null};$("calst").textContent="";
  if(v===3)actOcho();
}
[1,2,3,4,5].forEach(function(n){$("cm"+n).onclick=function(){calVista(n)}});
[].forEach.call(document.querySelectorAll("#cal .cback"),function(b){b.onclick=function(){calVista(0)}});
var calAnd=null,cal2={b:null,o:null};
calVista(0);
function envolver(x){return ((x%360)+540)%360-180}
function fmtOff(o){return (o>0?"+":"")+Math.round(o)+"°"}
function finCal(txt){hzOff=0;hzPrev=null;guardarOff();$("calst").textContent=txt;pintar()}
$("calok").onclick=function(){
  var t=calList[+$("calsel").value];if(!t||!pos)return;
  calAnd=null;
  var b=brg(pos.latitude,pos.longitude,t.la,t.lo),o=envolver(b-hd);
  if(!$("cal2").checked){off=o;ponerTab(hd,o);cal2={b:null,o:null};finCal("✓ Calibrado ("+fmtOff(o)+")");return}
  if(cal2.o===null){
    cal2={b:b,o:o,h:hd};
    $("calst").textContent="Lugar 1 guardado. Elige OTRO lugar en una dirección distinta (al menos 30° de diferencia) y pulsa de nuevo.";
    return;
  }
  if(dif(b,cal2.b)<30){$("calst").textContent="Ese lugar está casi en la misma dirección que el primero. Elige otro más hacia un lado.";return}
  var d2=envolver(o-cal2.o);
  ponerTab(cal2.h,cal2.o);ponerTab(hd,o);
  off=envolver(cal2.o+d2/2);
  var txt="✓ Calibrado con dos lugares ("+fmtOff(off)+")";
  if(Math.abs(d2)>10)txt+=". Aviso: los dos errores difieren "+Math.round(Math.abs(d2))+"°, la brújula no falla igual en todas las direcciones.";
  cal2={b:null,o:null};
  finCal(txt);
};
// Método andando o en coche: compara la brújula con la dirección real del recorrido (GPS)
$("calgps").onclick=function(){
  if(!pos)return;
  cal2={b:null,o:null};
  calAnd={la:pos.latitude,lo:pos.longitude,s:[]};
  $("calst").textContent="Avanza en línea recta con el móvil en vertical apuntando hacia delante…";
};
function calAndar(c){
  if(!calAnd)return;
  var dm=dst(calAnd.la,calAnd.lo,c.latitude,c.longitude)*1000;
  calAnd.s.push(hd);
  var need=Math.max(30,2.5*(c.accuracy||10));
  if(dm<need||calAnd.s.length<2){$("calst").textContent="Camina recto… "+Math.round(dm)+" de "+Math.round(need)+" m";return}
  var sx=0,sy=0,mal=0;
  calAnd.s.forEach(function(a){sx+=Math.sin(a*R);sy+=Math.cos(a*R)});
  var media=(Math.atan2(sx,sy)/R+360)%360;
  calAnd.s.forEach(function(a){mal=Math.max(mal,dif(a,media))});
  var b=brg(calAnd.la,calAnd.lo,c.latitude,c.longitude);
  calAnd=null;
  if(mal>25){$("calst").textContent="El móvil se movió demasiado (±"+Math.round(mal)+"°). Inténtalo de nuevo apuntando siempre hacia delante.";return}
  off=envolver(b-media);ponerTab(media,off);
  finCal("✓ Calibrado andando ("+fmtOff(off)+")");
}
$("calreset").onclick=function(){off=0;tab={};ocho8=false;calAnd=null;cal2={b:null,o:null};finCal("Calibración quitada")};
$("ochocerrar").onclick=function(){calVista(0)};
$("calcerrar").onclick=function(){cerrarOcho();calAnd=null;cal2={b:null,o:null};$("calst").textContent="";$("cal").style.display="none";ajustarMira()};
// ---- Modo coche (se activa solo al detectar velocidad) ----
var hdH=[],gT=0,modoCoche=false,velAlta=0,velBaja=0,posT=0,rumboGPS=null,velGPS=0,autoT=0,wl=null;
function actualizarMarcha(c){
  var v=(typeof c.speed==="number"&&c.speed>=0)?c.speed:0;
  var rh=(typeof c.heading==="number"&&!isNaN(c.heading))?c.heading:null;
  velGPS=v;rumboGPS=(v>1&&rh!==null)?rh:null;
  if(v>=8){velAlta++;velBaja=0}else if(v<2){velBaja++;velAlta=0}
  if(!modoCoche&&velAlta>=3)modoCoche=true;
  if(modoCoche&&velBaja>=20)modoCoche=false;
  // Autocalibración: una vez calibrada, afina la corrección de cada dirección con el rumbo real del GPS.
  // Solo si vas a más de 18 km/h, el móvil está quieto y apunta casi hacia delante (menos de 20° de diferencia).
  hdH.push(hd);if(hdH.length>3)hdH.shift();
  var calibrada=off!==0||Object.keys(tab).length>0;
  if($("auto").checked!==false&&calibrada&&rumboGPS!==null&&v>=5&&Math.abs(pit)<30&&hdH.length===3&&maxDif(hdH)<=8){
    var base=offPara(hd),d=envolver(rumboGPS-(hd+base+360)%360);
    if(Math.abs(d)<=20){
      var k=Math.round(hd/45)%8;
      tab[k]={o:envolver(base+0.15*d),n:(tab[k]?tab[k].n:0)+1};
      off=envolver(off+0.05*d);autoT=Date.now();hzOff*=0.8;
      if(Date.now()-gT>10000){gT=Date.now();guardarOff()}
    }
  }
}
// Entre dos lecturas del GPS, calcula dónde estás según velocidad y rumbo
function posEfectiva(){
  if(!pos)return null;
  var dt=(Date.now()-posT)/1000;
  if(modoCoche&&rumboGPS!==null&&velGPS>=3&&dt>0&&dt<4){
    var dm=velGPS*dt;
    return{latitude:pos.latitude+dm*Math.cos(rumboGPS*R)/111320,longitude:pos.longitude+dm*Math.sin(rumboGPS*R)/(111320*Math.cos(pos.latitude*R)),altitude:pos.altitude,accuracy:pos.accuracy};
  }
  return pos;
}
// Mantiene la pantalla encendida mientras se usa
async function pantallaEncendida(on){
  try{
    if(on){if(navigator.wakeLock&&!wl){wl=await navigator.wakeLock.request("screen");wl.addEventListener("release",function(){wl=null})}}
    else if(wl){await wl.release();wl=null}
  }catch(e){}
}
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"&&document.body.classList.contains("on")){pantallaEncendida(true);var tr=stream&&stream.getVideoTracks()[0];
  if(tr&&tr.readyState==="ended"){stream=null;pista=null}
  if(!stream)camara(true)}});
// ---- Zoom de la cámara (con dos dedos o con los botones) ----
var zoom=1,zMax=6,pista=null,capZoom=null,pz=null,pzFin=0,modosFoco=[],capDist=null,tFoco=null,tZ=null,ultRef=0;
function fmtZoom(z){return "Zoom ×"+String(parseFloat(z.toFixed(1))).replace(".",",")}
function aplicarZoom(z){
  zoom=Math.max(1,Math.min(zMax,z));
  if(capZoom&&pista){
    $("cam").style.transform="";
    try{pista.applyConstraints({advanced:[{zoom:zoom}]}).catch(function(){capZoom=null;aplicarZoom(zoom)})}catch(e){capZoom=null;aplicarZoom(zoom)}
  }else{
    $("cam").style.transform="scale("+zoom+")";
  }
  $("zval").textContent=fmtZoom(zoom);
  // Tras cambiar el zoom, vuelve a enfocar (si la cámara lo permite)
  clearTimeout(tZ);tZ=setTimeout(function(){if(pista&&modosFoco.length)enfocar()},600);
}
$("zmas").onclick=function(){aplicarZoom(zoom*1.25)};
$("zmenos").onclick=function(){aplicarZoom(zoom/1.25)};
function dist2(t){var dx=t[0].clientX-t[1].clientX,dy=t[0].clientY-t[1].clientY;return Math.sqrt(dx*dx+dy*dy)}
document.addEventListener("touchstart",function(e){if(document.body.classList.contains("on")&&e.touches.length===2)pz={d:dist2(e.touches),z:zoom}},{passive:true});
document.addEventListener("touchmove",function(e){if(pz&&e.touches.length===2){e.preventDefault();aplicarZoom(pz.z*dist2(e.touches)/pz.d)}},{passive:false});
document.addEventListener("touchend",function(e){if(e.touches.length<2){if(pz)pzFin=Date.now();pz=null}});
// ---- Enfoque de la cámara ----
function aplicarFoco(c){return pista?pista.applyConstraints({advanced:[c]}):Promise.reject(new Error("sin cámara"))}
function nada(){}
function iniciarFoco(){
  var w=$("fdw");w.className="";
  if(modosFoco.indexOf("continuous")>=0)aplicarFoco({focusMode:"continuous"}).catch(nada);
  if(capDist&&modosFoco.indexOf("manual")>=0){
    var mn=capDist.min>0?capDist.min:0.05,mx=isFinite(capDist.max)&&capDist.max>mn?capDist.max:100,f=$("fdist");
    f.value=1;
    f.oninput=function(){var d=mn*Math.pow(mx/mn,parseFloat(f.value));aplicarFoco({focusMode:"manual",focusDistance:d}).catch(nada)};
    $("fauto").onclick=function(){f.value=1;aplicarFoco({focusMode:modosFoco.indexOf("continuous")>=0?"continuous":"single-shot"}).catch(nada)};
    w.className="v";
  }
}
function anilloFoco(x,y){
  var e=$("foco");e.style.left=x+"px";e.style.top=y+"px";e.className="";void e.offsetWidth;e.className="v";
}
async function reiniciarCamara(){
  // iPhone/Safari no deja controlar el foco: volver a abrir la cámara hace que enfoque de nuevo
  if(!stream)return;
  stream.getTracks().forEach(function(t){t.stop()});stream=null;pista=null;
  await camara(true);
}
function enfocar(x,y){
  if(!pista&&!stream)return;
  if(x!=null)anilloFoco(x,y);
  if(modosFoco.length){
    var cont=modosFoco.indexOf("continuous")>=0,c={focusMode:modosFoco.indexOf("single-shot")>=0?"single-shot":(cont?"continuous":modosFoco[0])};
    if(x!=null){
      var v=$("cam"),W=innerWidth,H=innerHeight,vw=v.videoWidth,vh=v.videoHeight;
      if(vw){var s=Math.max(W/vw,H/vh);c.pointsOfInterest=[{x:Math.min(1,Math.max(0,((x-W/2)/s+vw/2)/vw)),y:Math.min(1,Math.max(0,((y-H/2)/s+vh/2)/vh))}]}
    }
    var c2={focusMode:c.focusMode};
    aplicarFoco(c).catch(function(){return aplicarFoco(c2)}).catch(nada);
    clearTimeout(tFoco);
    if(cont)tFoco=setTimeout(function(){aplicarFoco({focusMode:"continuous"}).catch(nada)},1800);
  }else if(x!=null&&Date.now()-ultRef>3000){
    ultRef=Date.now();reiniciarCamara();
  }
}
$("cam").addEventListener("click",function(e){if(Date.now()-pzFin<500)return;enfocar(e.clientX,e.clientY);identificarToque(e.clientX,e.clientY)});
// ---- Pulsar sobre la imagen para saber qué pueblo hay en ese punto ----
var tapSel=null,etqHit=[],tTap=null;
function distTxt(k){return (k<10?k.toFixed(1):Math.round(k)).toString().replace(".",",")+" km"}
function mostrarToque(x,html){
  var b=$("toque"),W=innerWidth,H=innerHeight;
  b.innerHTML=html;b.style.display="block";
  var w=b.offsetWidth,h=b.offsetHeight;
  var l=Math.max(8,Math.min(W-w-8,x-w/2)),t=toqueY-h-50;
  if(t<8)t=toqueY+50;
  b.style.transform="translate("+Math.round(l)+"px,"+Math.round(t)+"px)";
}
var toqueY=0;
function identificarToque(x,y){
  clearTimeout(tTap);
  var W=innerWidth,H=innerHeight,f=fEff(),best=null,i,p;
  toqueY=y;
  if(pit<-40||pit>(verPicos?55:30)){tapSel=null;mostrarToque(x,verPicos?"Baja un poco el móvil":"Apunta hacia el horizonte");tTap=setTimeout(finToque,3000);return}
  // 1) Lo que ya está dibujado: punto o etiqueta bajo el dedo (el más cercano al toque)
  var bd=1e9;
  for(i=0;i<etqHit.length;i++){
    p=etqHit[i];
    var dP=Math.hypot(x-p.x,y-p.y),enEt=Math.abs(x-p.x)<=p.w/2+4&&y>=p.ty-34&&y<=p.ty+4;
    var dd=enEt?Math.min(dP,Math.abs(x-p.x)):dP;
    if((enEt||dP<=44)&&dd<bd){bd=dd;best=p}
  }
  // 2) Si no, por dirección: pueblos en la vertical del toque, cuyo relieve deje verlos
  if(!best&&verPicos){
    var pe2=posEfectiva(),hd2=rumboC(),bs2=1e9;
    for(i=0;i<PK.length;i++){
      var k=PK[i];
      if(Math.abs(k.la-pe2.latitude)>0.75||Math.abs(k.lo-pe2.longitude)>0.95)continue;
      var a2=envolver(brg(pe2.latitude,pe2.longitude,k.la,k.lo)-hd2);
      if(Math.abs(a2)>60)continue;
      var dx2=Math.abs(W/2+f*Math.tan(a2*R)-x);if(dx2>45)continue;
      var dk2=dst(pe2.latitude,pe2.longitude,k.la,k.lo);
      if(dk2<0.5||dk2>alcance)continue;
      var v2=panVis(k);if(v2===null)v2=dk2<=10;
      if(v2!==true)continue;
      var sc2=dx2-k.e/200;
      if(sc2<bs2){bs2=sc2;best={n:k.n,la:k.la,lo:k.lo,e:k.e,dk:dk2,pico:true}}
    }
  }
  if(!best&&!verPicos){
    var pe=posEfectiva(),hdc=rumboC();
    var dmax=alcance,dLa=dmax/111,dLo=dmax/(111*Math.max(0.2,Math.cos(pe.latitude*R)));
    var c=enRecuadro(pe.latitude,pe.longitude,dLa,dLo),bs=1e9;
    for(i=0;i<c.length;i++){
      var q=c[i],t=q[3]||"city",corto=(t==="hamlet"||t==="isolated_dwelling");
      if(corto&&!verAldeas)continue;
      if(verPicos)continue;
      var dk=dst(pe.latitude,pe.longitude,q[1],q[2]);
      if(dk<0.5||dk>alcance||(corto&&dk>12))continue;
      var px=W/2+f*Math.tan(envolver(brg(pe.latitude,pe.longitude,q[1],q[2])-hdc)*R);
      if(Math.abs(envolver(brg(pe.latitude,pe.longitude,q[1],q[2])-hdc))>60)continue;
      var ddx=Math.abs(px-x);
      if(ddx>45)continue;
      var cand={n:q[0],la:q[1],lo:q[2],t:t,dk:dk},v=estadoVis(cand);
      if(v===undefined||v===null)v=dk<=10;
      if(v!==true)continue;
      var sc=ddx+dk*0.15; // a igualdad de dirección, gana el más cercano
      if(sc<bs){bs=sc;best=cand}
    }
  }
  if(!best){tapSel=null;mostrarToque(x,(verPicos?"Aquí no veo ningún pico":"Aquí no veo ningún pueblo")+'<small>Prueba a pulsar más cerca de un punto de color</small>');tTap=setTimeout(finToque,3500);pintar();return}
  if(best.pico){
    tapSel=null;
    mostrarToque(x,'<span style="color:'+COLPK+'">▲</span> '+esc(best.n)+'<small>'+Math.round(best.e).toLocaleString("es-ES")+' m · a '+distTxt(best.dk)+'</small>');
    tTap=setTimeout(finToque,6000);pintar();return;
  }
  tapSel={n:best.n,la:best.la,lo:best.lo};
  mostrarToque(x,'<span style="color:'+colorDe(best)+'">●</span> '+esc(best.n)+'<small>a '+distTxt(best.dk)+'</small>');
  tTap=setTimeout(finToque,6000);
  pintar();
}
function finToque(){tapSel=null;$("toque").style.display="none";pintar()}

var tToast=null,tCons=null;
function avisar(txt,ms){var t=$("toast");t.textContent=txt;t.className="";void t.offsetWidth;t.className="v";clearTimeout(tToast);tToast=setTimeout(function(){t.className=""},ms||6200)}
// Consejos de primera vez: cada uno sale una sola vez y no vuelve (se recuerdan en localStorage)
var CONSEJOS=[["consejoApuntar","👆 Apunta a un pueblo lejano",""],["consejoCalibrar","🎯 Si el nombre no coincide, calibra","calbtn"],["consejoEnfoque","Toca la pantalla para enfocar",""]];
function mostrarGuia(conPermisos){
  $("guiaPerm").style.display=conPermisos?"block":"none";
  $("guia").style.display="flex";$("guia").scrollTop=0;$("guiaok").focus();
}
$("guiaok").onclick=function(){$("guia").style.display="none"};
function consejosPrimeraVez(){
  var visto=true;try{visto=localStorage.getItem("guiaVista")==="1"}catch(e){}
  if(visto)return;
  clearTimeout(tCons);
  tCons=setTimeout(function(){
    if(!document.body.classList.contains("on"))return;
    try{localStorage.setItem("guiaVista","1")}catch(e){}
    mostrarGuia(false);
  },1500);
}
$("vconsejos").onclick=function(){
  mostrarGuia(true);
};
["gesturestart","gesturechange","gestureend"].forEach(function(n){document.addEventListener(n,function(e){if(document.body.classList.contains("on"))e.preventDefault()},{passive:false})});
// ---- Panorama del terreno: relieve en abanico de ±45° y hasta 80 km ----
var pan=null,panEnCurso=false,panBloq=0,elevC={},colaE={},pidiendoE=false,FOVL=69.4;
var selVis=null;
var DS=[0.3,0.6,1,1.5,2,2.5,3,4,5,6,7,8,9,10,12,14,16,18,20,23,26,29,32,35,40,48,56,64,72,80];
// Alcance normal 40 km; el interruptor 🔭 lo amplía a 80 km (pide solo los puntos lejanos que falten)
var alcance=40;
var usarRelieve=true;
function nJ(a){var n=0;while(n<DS.length&&DS[n]<=a+0.001)n++;return n}
function ek(p){return p.la.toFixed(4)+","+p.lo.toFixed(4)}
function panIdx(az){return (envolver(az-pan.c)+45)/(2.5*(pan.paso||1))}
function Smod(az){var f=panIdx(az);if(f<0||f>pan.az.length-1)return null;var i=Math.floor(f),j=Math.min(i+1,pan.az.length-1),t=f-i;return pan.S[i]*(1-t)+pan.S[j]*t}
// El relieve se guarda en el móvil por celdas de ~500 m y rayos fijos cada 2,5°: al repetir un sitio no se pide nada
var demC={},panProg="",panoTim=0;
// Reintenta el panorama aunque el móvil esté quieto (si no, solo se reintentaría al mover la brújula)
function reintentarPano(ms){
  ms=Math.max(ms,bloqRel-Date.now()+1000);
  panBloq=Date.now()+ms;
  clearTimeout(panoTim);
  panoTim=setTimeout(function(){panBloq=0;pintar()},ms+250);
}
// Relieve guardado en IndexedDB (mucho más espacio que localStorage). Cada celda lleva la fecha de último uso
// y, al pasar de DEM_MAX celdas, se borran solo las más antiguas en vez de todo.
var DEM_MAX=1500,demIdx=null;
async function cargarDemIdx(){if(!demIdx){try{demIdx=(await bdGet("demIdx3"))||{}}catch(e){demIdx={}}}return demIdx}
async function demGet(c){
  if(demC[c])return demC[c];
  var d=null;
  try{var v=await bdGet("dem3:"+c);if(v&&v.d)d=v.d}catch(e){}
  var ks=Object.keys(demC);if(ks.length>40)ks.forEach(function(k){delete demC[k]});
  demC[c]=d||{};
  return demC[c];
}
var demCola=Promise.resolve(),demPend={};
// Las escrituras van en cola (una a la vez) y las pendientes de una misma celda se fusionan en una sola
function demGuardar(c,obj){
  var ya=demPend[c]!==undefined;demPend[c]=obj;
  if(ya)return demCola;
  demCola=demCola.then(function(){var o=demPend[c];delete demPend[c];return demGuardarReal(c,o)});
  return demCola;
}
async function demGuardarReal(c,obj){
  try{
    var idx=await cargarDemIdx(),t=Date.now();
    await bdSet("dem3:"+c,{t:t,d:obj});
    idx[c]=t;
    var ks=Object.keys(idx);
    if(ks.length>DEM_MAX){
      var viejas=ks.sort(function(a,b){return idx[a]-idx[b]}).slice(0,ks.length-DEM_MAX+100);
      viejas.forEach(function(k){delete idx[k];delete demC[k]});
      await bdDel(viejas.map(function(k){return "dem3:"+k}));
    }
    await bdSet("demIdx3",idx);
  }catch(e){}
}
// Pasa a IndexedDB el relieve que versiones anteriores dejaron en localStorage (y libera ese espacio)
// Limpia el relieve de versiones anteriores: usaba otra lista de distancias y ya no sirve
(async function limpiarDemAntiguo(){
  try{Object.keys(localStorage).filter(function(k){return k.indexOf("dem:")===0}).forEach(function(k){localStorage.removeItem(k)})}catch(e){}
  try{
    var d=await idb();
    await new Promise(function(res){
      var t=d.transaction("kv","readwrite"),st=t.objectStore("kv"),c=st.openKeyCursor(IDBKeyRange.bound("dem","dem:\uffff"));
      c.onsuccess=function(){var cur=c.result,k=cur&&String(cur.key);if(cur){if(/^dem:|^dem2:|^demIdx2?$/.test(k))st.delete(cur.key);cur.continue()}};
      t.oncomplete=res;t.onerror=res;t.onabort=res;
    });
  }catch(e){}
})();
async function construirPano(){
  if(!usarRelieve||panEnCurso||Date.now()<panBloq||!pos)return;
  panEnCurso=true;panProg="0%";
  var q=0.005,la=Math.round(pos.latitude/q)*q,lo=Math.round(pos.longitude/q)*q,cel=Math.round(pos.latitude/q)+","+Math.round(pos.longitude/q);
  var k0=Math.round(rumboC()/2.5)-18,ks=[],dem=await demGet(cel),falta=[],i,j;
  var nj=nJ(alcance),libre=Math.max(0,omLibres()-RESERVA_ELEV);
  function rayos(paso){var a=[];for(var n=0;n<37;n+=paso)a.push(((k0+n)%144+144)%144);return a}
  function faltan(paso){
    var a=[];if(dem.o===undefined)a.push("o");
    rayos(paso).forEach(function(k){for(var n=0;n<nj;n++)if(dem[k+"|"+n]===undefined)a.push(k+"|"+n)});
    return a;
  }
  // Panorama progresivo: primero la resolucion mas fina que quepa en el cupo.
  // Si no cabe ninguna, se usa la mas gruesa (5-7,5 grados) y se afina en la siguiente pasada.
  var pasoPan=0;
  for(var pp=1;pp<=3;pp++){
    var fpp=faltan(pp);
    if(fpp.length<=libre){pasoPan=pp;falta=fpp;ks=rayos(pp);break}
  }
  if(!pasoPan){
    panEnCurso=false;panProg="";
    reintentarPano(20000);
    $("msg").textContent="Cuota de relieve agotada; lo reintentaré automáticamente.";
    return;
  }
  function pt(id){var s=id.split("|"),az=s[0]*2.5,d=DS[+s[1]];return[la+d*Math.cos(az*R)/111.32,lo+d*Math.sin(az*R)/(111.32*Math.cos(la*R))]}
  var total=falta.length,hecho=0,nLote=0,ok=true,fuente="",alcA=alcance;
  while(falta.length&&ok&&pos){
    var lote=falta.splice(0,100),lats=[],lons=[];
    lote.forEach(function(id){var p=id==="o"?[la,lo]:pt(id);lats.push(p[0].toFixed(5));lons.push(p[1].toFixed(5))});
    var al=await altitudes(lats,lons);
    if(!al){ok=false;break}
    fuente=al.f;lote.forEach(function(id,n){dem[id]=al.h[n]});
    hecho+=lote.length;panProg=Math.round(100*hecho/total)+"%";if(++nLote%5===0&&al.f!=="relieve incluido")demGuardar(cel,dem);
    pintar();
  }
  if(hecho>0&&fuente!=="relieve incluido")demGuardar(cel,dem); // guarda también lo descargado si el proceso se corta
  panEnCurso=false;
  if(!ok||!pos){reintentarPano(30000);return}
  var gps=pos.altitude,H0=(typeof gps==="number"&&gps>dem.o+150)?gps:dem.o+2,azs=[],M=[],S=[];
  ks.forEach(function(k){
    azs.push(k*2.5);var m=-9,fila=[];
    for(j=0;j<nj;j++){var dm=DS[j]*1000,ang=Math.atan2(dem[k+"|"+j]-H0-dm*dm/14.6e6,dm);if(ang>m)m=ang;fila.push(m)}
    M.push(fila);S.push(m);
  });
  pan={la:la,lo:lo,c:azs[Math.floor(azs.length/2)],az:azs,M:M,S:S,H0:H0,cel:cel,alc:alcA,paso:pasoPan,t:Date.now()};
  fuenteRel=(fuente||"memoria del móvil")+", panorama";errRel="";
  pintar();
}
// true/false si el pueblo se ve; undefined si falta algún dato; null si hay que usar el método anterior
function panVis(p){
  if(!usarRelieve)return true;
  if(Date.now()<panBloq)return null;
  if(!pan)return undefined;
  var az=brg(pan.la,pan.lo,p.la,p.lo),dk=dst(pan.la,pan.lo,p.la,p.lo),f=panIdx(az);
  if(dk>pan.alc||dk<0.4||f<0||f>pan.az.length-1)return null;
  var e=elevC[ek(p)];
  if(e===undefined){pedirElev(p);return undefined}
  if(e===null)return null;
  var i=Math.floor(f),j2=Math.min(i+1,pan.az.length-1),t=f-i,j=-1,k;
  for(k=0;k<DS.length&&DS[k]<dk-0.05;k++)j=k;
  if(j<0)return true;
  var occ=pan.M[i][j]*(1-t)+pan.M[j2][j]*t,dm=dk*1000;
  return Math.atan2(e+10-pan.H0-dm*dm/14.6e6,dm)>=occ-0.004;
}
// Las altitudes de los pueblos no cambian: se guardan en IndexedDB y se reutilizan entre sesiones (tope 30000)
var elevS={},elevTim=0;
(async function elevCargar(){
  try{var o=await bdGet("elevP");if(o&&o.d){for(var k in o.d){if(elevC[k]===undefined)elevC[k]=o.d[k];elevS[k]=o.d[k]}}}catch(e){}
})();
function elevGuardar(){
  clearTimeout(elevTim);
  elevTim=setTimeout(async function(){
    try{
      var ks=Object.keys(elevS);
      if(ks.length>30000){ks.slice(0,ks.length-25000).forEach(function(k){delete elevS[k]})}
      await bdSet("elevP",{d:elevS});
    }catch(e){}
  },4000);
}
function pedirElev(p){colaE[ek(p)]=[p.la,p.lo];if(!pidiendoE){pidiendoE=true;setTimeout(vaciarElev,200)}}
// Las altitudes de las etiquetas se piden por tandas y solo con el cupo que sobra en este minuto:
// si no hay cupo, se quedan en cola y se piden en cuanto Open-Meteo reinicie la cuenta.
async function vaciarElev(){
  var libres=omLibres();
  if(libres<1||Date.now()<bloqRel){
    pidiendoE=false;
    if(Object.keys(colaE).length)setTimeout(function(){if(!pidiendoE){pidiendoE=true;vaciarElev()}},4000);
    return;
  }
  var ks=Object.keys(colaE).slice(0,Math.min(100,libres)),lats=[],lons=[];
  ks.forEach(function(k){lats.push(colaE[k][0].toFixed(5));lons.push(colaE[k][1].toFixed(5))});
  if(ks.length){
    var al=await altitudes(lats,lons);
    ks.forEach(function(k,i){delete colaE[k];if(al){elevC[k]=al.h[i];if(typeof al.h[i]==="number"&&al.f!=="relieve incluido")elevS[k]=al.h[i]}else{elevC[k]=null;setTimeout(function(){delete elevC[k]},30000)}});
    if(al&&al.f!=="relieve incluido")elevGuardar();
  }
  pidiendoE=false;
  if(Object.keys(colaE).length){pidiendoE=true;setTimeout(vaciarElev,200)}
  pintar();
}
function estadoVis(p){var v=panVis(p);if(v!==null)return v;var k=clave(p),c=cacheV[k];if(c!==undefined&&visCache[k]!==undefined)visUso[k]=Date.now();return c}
// Mientras el panorama de relieve aún no existe (y no ha fallado), no gastes cupo en trazas sueltas:
// el panorama ya dirá qué se ve a cada distancia. Si falla, se vuelve al método anterior.
function lanzarVis(p){if(usarRelieve&&!pan&&!errRel&&Date.now()>=panBloq)return;if(panVis(p)===null&&cacheV[clave(p)]===undefined)verificar(p)}
// ---- Etiquetas sobre la cámara ----
function fEff(){
  var v=$("cam"),W=innerWidth,H=innerHeight,vw=v.videoWidth||0,vh=v.videoHeight||0;
  var s=vw?Math.max(W/vw,H/vh):1,fv=vw?s*Math.max(vw,vh)/2/Math.tan(FOVL/2*R):H/2/Math.tan(FOVL/2*R);
  return fv*zoom;
}
var COL={city:"#ff4d6d",town:"#ffd60a",village:"#ffd60a",hamlet:"#00e5ff",isolated_dwelling:"#00e5ff"},COLPK="#80ed99";
// El color indica el tamaño de la localidad (ciudad / pueblo / aldea); el verde queda para los picos
function colorDe(q){return COL[q.t]||COL.city}
// ---- Picos de montaña (OpenStreetMap, natural=peak) ----
var PK=[],verPicos=false,pkCentro=null,pkCargando=false,pkEstado="",pkProx=0;
// OpenStreetMap suele tener el mismo pico dos veces (dos nodos, o con nombres como «Veleta» y «Pico Veleta»).
// Se queda solo el más alto de cada grupo: mismo nombre a menos de 3 km, o cualquier pico a menos de 300 m.
function nombrePico(n){return n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[^a-z0-9]+/).filter(function(w){return w&&!/^(pico|cerro|monte|alto|el|la|los|las|de|del)$/.test(w)}).join(" ")}
function quitarDuplicados(lista){
  var orden=lista.slice().sort(function(a,b){return ((b.mio?1:0)-(a.mio?1:0))||(b.e-a.e)}),ok=[];
  orden.forEach(function(q){
    var nq=nombrePico(q.n);
    var dup=ok.some(function(o){
      if(Math.abs(q.la-o.la)>0.03||Math.abs(q.lo-o.lo)>0.06)return false; // más lejos de 3 km: no puede ser duplicado
      var d=dst(q.la,q.lo,o.la,o.lo);
      return d<0.3||(d<3&&o._n===nq);
    });
    if(!dup){q._n=nq;ok.push(q)}
  });
  return ok;
}
// #info no se ve con la cámara activa: los mensajes importantes salen también como aviso
function infoCam(t){$("info").textContent=t;if(document.body.classList.contains("on"))avisar(t,3500)}
function usarPicos(c,aviso){
  var mios=misPicos().map(function(d){return{n:d[0],la:d[1],lo:d[2],e:d[3],mio:1}});
  PK=quitarDuplicados(c.datos.map(function(d){return{n:d[0],la:d[1],lo:d[2],e:d[3]}}).concat(mios));
  PK.forEach(function(q){elevC[ek(q)]=q.e});
  pkCentro={la:c.la,lo:c.lo};pkEstado="ok";
  infoCam("⛰ "+PK.length+" picos cargados"+(aviso||""));
  pintar();
}
// Pide los picos a varios servidores Overpass a la vez; devuelve el primero que responda con datos
function parsePicos(t){
  var out=[];
  t.split("\n").forEach(function(l){
    var k=l.split("|");if(k.length<4)return;
    var a=parseFloat(k[0]),b=parseFloat(k[1]),e=parseFloat(String(k[k.length-1]).replace(",",".")),n=k.slice(2,-1).join("|").trim();
    if(isNaN(a)||isNaN(b)||isNaN(e)||!n)return;
    out.push([n,a,b,e]);
  });
  return out;
}
function pedirPicos(q){
  var sv=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass.private.coffee/api/interpreter","https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
  return new Promise(function(res,rej){
    var pend=sv.length,fallos=[];
    sv.forEach(function(u,i){
      setTimeout(function(){
        fetchT(u,{method:"POST",body:"data="+encodeURIComponent(q)},25000)
          .then(function(r){if(!r.ok)throw new Error("error "+r.status);return r.text()})
          .then(function(t){var o=parsePicos(t);if(!o.length)throw new Error("respuesta vacía");res(o)})
          .catch(function(e){fallos.push(u.split("/")[2]+": "+motivoErr(e));if(--pend===0)rej(fallos)});
      },i*1200);
    });
  });
}
// Picos incluidos en la página: se leen una sola vez, la primera vez que se necesitan
var PKALL=null;
var pkBaseP=null;
function cargarPicosBase(){
  if(PKALL)return Promise.resolve();
  if(pkBaseP)return pkBaseP;
  pkBaseP=new Promise(function(res){
    var el=document.createElement("script");
    el.src="data/picos.js";el.async=true;
    el.onload=function(){res()};
    el.onerror=function(){pkBaseP=null;res()};
    document.head.appendChild(el);
  });
  return pkBaseP;
}
function picosCerca(la,lo,km){
  if(!PKALL){
    try{PKALL=parsePicos(window.DATOS_PICOS||"")}catch(e){PKALL=[]}
    window.DATOS_PICOS=null;
  }
  var dLa=km/111,dLo=km/(111*Math.max(0.2,Math.cos(la*R))),out=[];
  for(var i=0;i<PKALL.length;i++){var k=PKALL[i];if(Math.abs(k[1]-la)<dLa&&Math.abs(k[2]-lo)<dLo&&dst(la,lo,k[1],k[2])<=km)out.push(k)}
  return out;
}
async function cargarPicos(){
  if(pkCargando||!pos||Date.now()<pkProx)return;
  var la=pos.latitude,lo=pos.longitude;
  if(pkCentro&&PK.length&&dst(la,lo,pkCentro.la,pkCentro.lo)<20)return;
  pkCargando=true;pkEstado="cargando";infoCam("Buscando picos de la zona…");
  // Primero la base incluida (data/picos.js, sin red); si no hay picos cerca (fuera de España) se pide a OpenStreetMap
  if(!PKALL&&!window.DATOS_PICOS)await cargarPicosBase();
  var locales=picosCerca(la,lo,80);
  var mios=misPicos().filter(function(d){return dst(la,lo,d[1],d[2])<=80});
  if(mios.length)locales=locales.concat(mios);
  if(locales.length){usarPicos({la:la,lo:lo,datos:locales});pkCargando=false;return}
  var c=null;
  try{c=await bdGet("picos")}catch(e){}
  if(c&&c.datos&&c.datos.length&&dst(la,lo,c.la,c.lo)<20){usarPicos(c);pkCargando=false;return}
  var q='[out:csv(::lat,::lon,name,ele;false;"|")][timeout:25];node["natural"="peak"]["name"]["ele"](around:80000,'+la.toFixed(4)+','+lo.toFixed(4)+');out;';
  var datos=null,motivosPk=[];
  // Se consultan varios servidores casi a la vez y gana el primero que responde (máx. 2 rondas de 25 s)
  for(var ronda=0;ronda<2&&!datos;ronda++){
    try{datos=await pedirPicos(q)}catch(m){motivosPk=m||[];await espera(1500)}
  }
  if(datos){
    c={la:la,lo:lo,datos:datos,fecha:new Date().toLocaleDateString("es-ES")};
    try{await bdSet("picos",c)}catch(e){}
    usarPicos(c);
  }else if(c&&c.datos&&c.datos.length&&dst(la,lo,c.la,c.lo)<60){
    usarPicos(c," (guardados, sin conexión)");
  }else{
    pkEstado="error";pkProx=Date.now()+20000;
    infoCam("No pude descargar los picos ("+(motivosPk.slice(0,2).join("; ")||"sin respuesta")+"). Reintentando…");
  }
  pkCargando=false;
}
$("lejosb").onclick=function(){
  alcance=alcance===40?80:40;
  var l=alcance===80;
  this.classList.toggle("act",l);this.setAttribute("aria-pressed",l?"true":"false");
  this.setAttribute("aria-label","Más lejos: alcance "+alcance+" km");
  this.title=l?"Alcance 80 km. Pulsa para volver a 40 km":"Alcance 40 km. Pulsa para ampliar a 80 km";
  avisar(l?"🔭 Ahora ves hasta 80 km."+(DEMLOC?"":" Puede tardar unos segundos en descargar el relieve."):"🔭 Ahora ves hasta 40 km.",4500);
  panBloq=0;$("info").textContent="🔭 Alcance: "+alcance+" km"+(l&&!DEMLOC?" (descargando relieve lejano)":"");
  pintar();
};
$("relb").onclick=function(){
  usarRelieve=!usarRelieve;
  this.classList.toggle("act",usarRelieve);this.setAttribute("aria-pressed",usarRelieve?"true":"false");
  this.title=usarRelieve?"Relieve activado: se ocultan los lugares tapados por montañas":"Relieve desactivado: se muestran todos los lugares por dirección";
  avisar(usarRelieve?"🏔 Relieve activado: compruebo si las montañas tapan los pueblos.":"🏔 Relieve desactivado: muestro los pueblos sin comprobar las montañas.",4500);
  panBloq=0;pintar();
};
$("picosb").onclick=function(){
  verPicos=!verPicos;
  this.classList.toggle("act",verPicos);this.setAttribute("aria-pressed",verPicos?"true":"false");
  document.body.classList.toggle("picos",verPicos);
  actAldeasBtn();
  if(verPicos){pkProx=0;cargarPicos()}
  pintar();
};
function actAldeasBtn(){var b=$("aldeas");b.disabled=verPicos;b.style.opacity=verPicos?".45":"";var t=verPicos?"No disponible mientras se muestran los picos":verAldeas?"Se ven pueblos y aldeas. Pulsa para ver solo pueblos":"Se ven solo pueblos. Pulsa para ver también las aldeas";b.title=t;b.setAttribute("aria-label","Aldeas: "+t)}
// Pico bajo la mira: dentro del campo vertical de la camara y lo mas centrado
// posible en pantalla (distancia angular 2D), no solo el que menos se desvia en
// horizontal. Asi una cumbre cercana que asoma muy alta no le gana a la que de
// verdad estas apuntando. La altura aparente lleva la correccion de curvatura.
function picoMira(pe,hdc){
  var best=null,bs=1e9,i,k,dd,dk,vv,sc,el,dv,tol=tolMira();
  var f=fEff(),vMax=Math.atan(innerHeight*0.5/f)/R+3;
  var h0=pan?pan.H0:(pos&&typeof pos.altitude==="number"&&isFinite(pos.altitude)?pos.altitude+2:null);
  for(i=0;i<PK.length;i++){
    k=PK[i];
    if(Math.abs(k.la-pe.latitude)>0.75||Math.abs(k.lo-pe.longitude)>0.95)continue;
    dd=Math.abs(envolver(brg(pe.latitude,pe.longitude,k.la,k.lo)-hdc));
    if(dd>tol)continue;
    dk=dst(pe.latitude,pe.longitude,k.la,k.lo);
    if(dk<0.5||dk>alcance)continue;
    vv=panVis(k);if(vv===null)vv=dk<=10;
    if(vv!==true)continue;
    dv=0;
    if(h0!==null){
      el=Math.atan2(k.e-h0-Math.pow(dk*1000,2)/14.6e6,dk*1000)/R;
      dv=Math.abs(el-pit);
      if(dv>vMax)continue; // ni siquiera cabe en el encuadre vertical
    }
    sc=Math.sqrt(dd*dd+0.6*dv*dv)-k.e/10000; // centrado en pantalla; a igualdad, el mas alto
    if(sc<bs){bs=sc;best={n:k.n,la:k.la,lo:k.lo,e:k.e,dk:dk}}
  }
  return best;
}
function etiquetas(pe,hdc){
  var W=innerWidth,H=innerHeight,f=fEff(),med=Math.atan((W/2)/f)/R+3,c=[],i;
  var cand=enRecuadro(pe.latitude,pe.longitude,0.75,0.95);
  for(i=0;i<cand.length;i++){
    var p=cand[i],t=p[3]||"city",corto=(t==="hamlet"||t==="isolated_dwelling");
    if(verPicos)continue; // con picos activados solo se dibujan picos
    if(corto&&!verAldeas)continue;
    if(Math.abs(p[1]-pe.latitude)>0.75||Math.abs(p[2]-pe.longitude)>0.95)continue;
    var d=envolver(brg(pe.latitude,pe.longitude,p[1],p[2])-hdc);
    if(Math.abs(d)>med)continue;
    var dk=dst(pe.latitude,pe.longitude,p[1],p[2]);
    if(dk<0.4||dk>alcance||(corto&&dk>12))continue;
    c.push({n:p[0],la:p[1],lo:p[2],t:t,dk:dk,d:d,sel:!!(selVis&&selVis.n===p[0]&&Math.abs(selVis.la-p[1])<1e-6&&Math.abs(selVis.lo-p[2])<1e-6),tap:!!(tapSel&&tapSel.n===p[0]&&Math.abs(tapSel.la-p[1])<1e-6&&Math.abs(tapSel.lo-p[2])<1e-6)});
  }
  // El pueblo señalado por la mira va primero y siempre se dibuja
  c.sort(function(a,b){return ((b.sel||b.tap)?1:0)-((a.sel||a.tap)?1:0)||a.dk-b.dk});
  etqHit=[];
  var out=[],used=[],fc=0,fp=0,fa=0;
  // Las etiquetas no se colocan debajo del panel superior (quedarían tapadas)
  var topMin=document.body.classList.contains("on")?document.querySelector("main").getBoundingClientRect().bottom+4:0;
  function hueco(x,w,yb){
    for(var L=0;L<6;L++){
      var y2=yb-L*34,r={a:x-w/2-3,b:x+w/2+3,c:y2-31,d:y2};
      if(r.c<topMin)break;
      if(!used.some(function(o){return r.a<o.b&&r.b>o.a&&r.c<o.d&&r.d>o.c})){used.push(r);return L}
    }
    return -1;
  }
  function elev(q,e,dk){return(pan&&typeof e==="number")?Math.atan2(e-pan.H0-Math.pow(dk*1000,2)/14.6e6,dk*1000):0}
  var n=0;
  for(i=0;i<c.length&&n<14;i++){
    var q=c[i],v=(q.sel||q.tap)?true:panVis(q);
    if(v===null)v=q.dk<=10;
    if(v!==true)continue;
    var x=W/2+f*Math.tan(q.d*R),w=8.5*q.n.length+60;
    var e=elevC[ek(q)],el=(pan&&typeof e==="number")?Math.atan2(e+10-pan.H0-Math.pow(q.dk*1000,2)/14.6e6,q.dk*1000):0;
    var y=H/2-f*Math.tan(el-pit*R),col=colorDe(q);
    var L=hueco(x,w,y-8);
    if(L<0){if(!q.sel&&!q.tap)continue;L=0}
    var ty=y-8-L*34;n++;
    if(q.t==="city")fc=1;else if(q.t==="hamlet"||q.t==="isolated_dwelling")fa=1;else fp=1;
    out.push({k:"ln",x:Math.round(x),y:Math.round(ty),h:Math.max(0,Math.round(y-ty)),c:col});
    out.push({k:"pt",x:Math.round(x),y:Math.round(y),c:col,sel:q.sel||q.tap});
    etqHit.push({n:q.n,la:q.la,lo:q.lo,t:q.t,dk:q.dk,x:x,y:y,ty:ty,w:w});
    out.push({k:"et",x:Math.round(x),y:Math.round(ty),c:col,sel:q.sel||q.tap,html:esc(q.n)+'<small> '+(q.dk<10?q.dk.toFixed(1):Math.round(q.dk))+' km</small>'});
  }
  // Picos de montaña visibles (los más altos primero)
  if(verPicos&&PK.length&&pan){
    var cp=[];
    for(i=0;i<PK.length;i++){
      var k=PK[i];
      if(Math.abs(k.la-pe.latitude)>0.75||Math.abs(k.lo-pe.longitude)>0.95)continue;
      var dd=envolver(brg(pe.latitude,pe.longitude,k.la,k.lo)-hdc);
      if(Math.abs(dd)>med)continue;
      var dkk=dst(pe.latitude,pe.longitude,k.la,k.lo);
      if(dkk<0.5||dkk>alcance)continue;
      cp.push({n:k.n,la:k.la,lo:k.lo,e:k.e,dk:dkk,d:dd});
    }
    cp.sort(function(a,b){return b.e-a.e});
    var np=0;
    for(i=0;i<cp.length&&np<12;i++){
      var m=cp[i],vv=panVis(m);
      if(vv===null)vv=m.dk<=10;
      if(vv!==true)continue;
      var px=W/2+f*Math.tan(m.d*R),py=H/2-f*Math.tan(elev(m,m.e,m.dk)-pit*R);
      if(py<topMin+14||py>H-100)continue;
      var txt='▲ '+m.n,sub=' '+Math.round(m.e).toLocaleString("es-ES")+' m · '+(m.dk<10?m.dk.toFixed(1):Math.round(m.dk))+' km',pw=8*(txt.length+sub.length)*0.95+24;
      var PL=hueco(px,pw,py-10);
      if(PL<0)continue;
      var pty=py-10-PL*34;np++;
      out.push({k:"ln",x:Math.round(px),y:Math.round(pty),h:Math.max(0,Math.round(py-pty)),c:COLPK});
      out.push({k:"pk",x:Math.round(px),y:Math.round(py)});
      etqHit.push({n:m.n,la:m.la,lo:m.lo,e:m.e,dk:m.dk,x:px,y:py,ty:pty,w:pw,pico:true});
      out.push({k:"et",x:Math.round(px),y:Math.round(pty),c:COLPK,html:esc(txt)+'<small>'+esc(sub)+'</small>'});
    }
  }
  leyenda(fc,fp,fa,!!np);
  pintarEtq(out);
}
var legC="";
// La leyenda solo muestra los tipos de localidad que hay dibujados en este momento (y los picos si se ven)
function leyenda(c,p,a,k){
  var key=(c?1:0)+""+(p?1:0)+(a?1:0)+(k?1:0);
  if(key===legC)return;legC=key;
  $("lgC").className=c?"v":"";$("lgP").className=p?"v":"";$("lgA").className=a?"v":"";$("lgK").className=k?"v":"";
  $("leyenda").className=(c||p||a||k)?"":"vacia";
}
// Los elementos de las etiquetas se crean una vez y se reutilizan; solo se escribe lo que cambia y se mueven con transform
var etqPool={ln:[],pt:[],pk:[],et:[]};
function pintarEtq(out){
  var cont=$("etq"),n={ln:0,pt:0,pk:0,et:0},i,o,el,pool,v,t;
  for(i=0;i<out.length;i++){
    o=out[i];pool=etqPool[o.k];el=pool[n[o.k]];
    if(!el){el=document.createElement(o.k==="et"?"div":"i");el.className=o.k;el._cl=o.k;cont.appendChild(el);pool.push(el)}
    n[o.k]++;
    if(el._oc){el.style.display="";el._oc=false}
    v=o.k+(o.sel?" sel":"");
    if(el._cl!==v){el.className=v;el._cl=v}
    t="translate("+o.x+"px,"+o.y+"px)"+(o.k==="et"?" translate(-50%,-100%)":"");
    if(el._tr!==t){el.style.transform=t;el._tr=t}
    if(o.k==="ln"){
      if(el._h!==o.h){el.style.height=o.h+"px";el._h=o.h}
      if(el._co!==o.c){el.style.background=o.c;el._co=o.c}
    }else if(o.k==="pt"){
      if(el._co!==o.c){el.style.background=o.c;el._co=o.c}
    }else if(o.k==="et"){
      v=o.c+"|"+(o.sel?1:0);
      if(el._co!==v){el.style.borderColor=o.c;el.style.background=o.sel?o.c:"";el._co=v}
      if(el._html!==o.html){el.innerHTML=o.html;el._html=o.html}
    }
  }
  ocultarSobrantes(n);
}
function ocultarSobrantes(n){
  for(var k in etqPool){var pool=etqPool[k],used=n?n[k]:0;for(var i=used;i<pool.length;i++){if(!pool[i]._oc){pool[i].style.display="none";pool[i]._oc=true}}}
}
function limpiarEtq(){etqHit=[];ocultarSobrantes(null);leyenda(0,0,0,0)}
// ---- Alinear la brújula con el horizonte ----
function skyline(g,w,h){
  var E=[],x,y,k,lim=Math.floor(h*0.85);
  for(y=0;y<h;y++)E.push(new Float32Array(w));
  for(x=0;x<w;x++)for(y=3;y<lim;y++){var a=0,b=0;for(k=1;k<=3;k++){a+=g[(y-k)*w+x];b+=g[(y+k-1)*w+x]}E[y][x]=Math.abs(a-b)/3}
  var dp=[],bk=[];
  for(x=0;x<w;x++){dp.push(new Float32Array(h));bk.push(new Int16Array(h))}
  for(y=0;y<h;y++)dp[0][y]=E[y][0];
  for(x=1;x<w;x++)for(y=0;y<lim;y++){
    var best=-1e9,by=y;
    for(var dy=-2;dy<=2;dy++){var yy=y+dy;if(yy<0||yy>=lim)continue;var s=dp[x-1][yy]-1.5*Math.abs(dy);if(s>best){best=s;by=yy}}
    dp[x][y]=best+E[y][x];bk[x][y]=by;
  }
  var ye=0;for(y=0;y<lim;y++)if(dp[w-1][y]>dp[w-1][ye])ye=y;
  var ys=new Array(w),tot=0;
  for(x=w-1;x>=0;x--){ys[x]=ye;tot+=E[ye][x];if(x>0)ye=bk[x][ye]}
  return{y:ys,fuerza:tot/w};
}
function mediana(a){var b=a.slice().sort(function(m,n){return m-n});return b[Math.floor(b.length/2)]}
// Busca cuánto hay que girar el rumbo (±15°) para que la silueta de la imagen coincida con la calculada del relieve
function ajusteHorizonte(ys,w,h,vw,vh,pitRad,hdc){
  var fv=Math.max(vw,vh)/2/Math.tan(FOVL/2*R),e=[],dz=[],x;
  for(x=0;x<w;x++){
    dz.push(Math.atan(((x+0.5)*vw/w-vw/2)/(fv*Math.cos(pitRad)))/R);
    e.push(pitRad+Math.atan((vh/2-ys[x]*vh/h)/fv));
  }
  var errs=[],mejor=null,s;
  for(s=-15;s<=15;s+=0.5){
    var r=[],mn=9,mx=-9;
    for(x=0;x<w;x++){var m=Smod(hdc+s+dz[x]);if(m===null)continue;r.push(e[x]-m);if(m<mn)mn=m;if(m>mx)mx=m}
    if(r.length<w*0.6||(mx-mn)<0.026)continue;
    var b=mediana(r),er=0;r.forEach(function(v){er+=Math.abs(v-b)});er/=r.length;
    errs.push(er);
    if(!mejor||er<mejor.err)mejor={s:s,err:er};
  }
  if(!mejor||errs.length<20)return null;
  mejor.conf=1-mejor.err/mediana(errs);
  return mejor;
}
var cvGris=null,ctxGris=null;
function capturarGris(w){
  var v=$("cam");if(!v.videoWidth)return null;
  var h=Math.round(w*v.videoHeight/v.videoWidth);
  if(!cvGris){cvGris=document.createElement("canvas");ctxGris=cvGris.getContext("2d",{willReadFrequently:true})}
  if(cvGris.width!==w||cvGris.height!==h){cvGris.width=w;cvGris.height=h}
  var ctx=ctxGris;ctx.drawImage(v,0,0,w,h);
  var d=ctx.getImageData(0,0,w,h).data,g=new Float32Array(w*h);
  for(var i=0;i<w*h;i++)g[i]=0.299*d[4*i]+0.587*d[4*i+1]+0.114*d[4*i+2];
  return{g:g,w:w,h:h};
}
$("calhor").onclick=function(){
  var st=$("calst");
  if(!pan){st.textContent="Aún no tengo el relieve de la zona. Espera unos segundos y vuelve a pulsar.";return}
  if(zoom>1.05){st.textContent="Pon el zoom en ×1 para alinear con el horizonte.";return}
  var im=capturarGris(96);
  if(!im){st.textContent="La cámara no está lista.";return}
  var sk=skyline(im.g,im.w,im.h);
  if(sk.fuerza<8){st.textContent="No veo un horizonte claro entre cielo y terreno. Apunta a un horizonte despejado.";return}
  var v=$("cam"),r=ajusteHorizonte(sk.y,im.w,im.h,v.videoWidth,v.videoHeight,pit*R,rumboC());
  if(!r){st.textContent="El horizonte es demasiado plano para compararlo. Prueba hacia unas montañas.";return}
  if(r.conf<0.3||Math.abs(r.s)>=14.5){st.textContent="No coincide con claridad (confianza "+Math.round(r.conf*100)+"%). Mantén el móvil recto y prueba otra vez.";return}
  var o=envolver(offPara(hd)+hzPara(hd)+r.s);
  off=envolver(off+hzPara(hd)+r.s);ponerTab(hd,o);
  finCal("✓ Alineado con el horizonte ("+fmtOff(o)+", confianza "+Math.round(r.conf*100)+"%)");
};
// ---- Corrección automática del rumbo con el horizonte de la cámara ----
// Cada 1,5 s compara la silueta cielo/terreno de la imagen con la calculada del relieve. Solo se acepta
// si la confianza es alta y dos capturas seguidas coinciden; la corrección se aplica poco a poco, vale
// para la zona de rumbos donde se midió y no se guarda (la calibración guardada no se toca).
var hzAuto=false,hzSil=false,hzOff=0,hzH=0,hzT=0,hzConf=0,hzPrev=null,hzDet=null;
try{if(localStorage.getItem("hzAuto")==="1")hzAuto=true;if(localStorage.getItem("hzSil")==="1")hzSil=true}catch(e){}
$("hzauto").checked=hzAuto;$("hzsil").checked=hzSil;
$("hzauto").onchange=function(){hzAuto=this.checked;if(!hzAuto){hzOff=0;hzPrev=null}try{localStorage.setItem("hzAuto",hzAuto?"1":"0")}catch(e){}pintar()};
$("hzsil").onchange=function(){hzSil=this.checked;try{localStorage.setItem("hzSil",hzSil?"1":"0")}catch(e){}pintar()};
// La corrección vale entera cerca del rumbo donde se midió y se desvanece al girar más de 30° (a 90° ya no cuenta)
function hzPara(h){if(!hzAuto||!hzOff)return 0;var d=dif(h,hzH);return d<=30?hzOff:d>=90?0:hzOff*(90-d)/60}
function rumboC(){return (hd+offPara(hd)+hzPara(hd)+720)%360}
function horizonteAuto(){
  if(!hzAuto||!pos||!pan||panEnCurso||modoCoche||document.hidden||!document.body.classList.contains("on"))return;
  if($("cal").style.display==="block"||zoom>1.05||pit<-25||pit>15)return;
  var hc=rumboC();if(Math.abs(envolver(hc-pan.c))>20)return;
  var h0=hd,im=capturarGris(96);if(!im)return;
  var sk=skyline(im.g,im.w,im.h);
  hzDet={y:sk.y,w:im.w,h:im.h,t:Date.now(),ok:false};
  if(sk.fuerza<10){hzPrev=null;return}
  if(dif(hd,h0)>2){hzPrev=null;return} // el móvil se movía durante la captura
  var v=$("cam"),r=ajusteHorizonte(sk.y,im.w,im.h,v.videoWidth,v.videoHeight,pit*R,hc);
  if(!r||r.conf<0.5||Math.abs(r.s)>=14){hzPrev=null;return}
  hzDet.ok=true;
  // r.s es lo que falta girar respecto al rumbo corregido actual; exijo que dos capturas coincidan (±2°)
  var obj=envolver(hzPara(hd)+r.s);
  if(hzPrev===null||Math.abs(envolver(obj-hzPrev))>2){hzPrev=obj;return}
  var base=hzPara(hd);
  hzOff=Math.max(-20,Math.min(20,envolver(base+0.5*envolver(obj-base))));
  hzH=hd;hzT=Date.now();hzConf=r.conf;hzPrev=obj;
  pintar();
}
setInterval(horizonteAuto,1500);
// Dibuja sobre la cámara la silueta calculada del relieve (cian) y la detectada en la imagen (amarillo si coincide)
function dibujarSilueta(hdc){
  var c=$("sil"),W=innerWidth,H=innerHeight,dpr=Math.min(2,window.devicePixelRatio||1);
  var vis=hzSil&&pan&&document.body.classList.contains("on");
  c.style.display=vis?"block":"none";if(!vis)return;
  if(c.width!==Math.round(W*dpr)||c.height!==Math.round(H*dpr)){c.width=Math.round(W*dpr);c.height=Math.round(H*dpr)}
  var x,ctx=c.getContext("2d"),f=fEff(),pr=pit*R,dib=false;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);ctx.lineWidth=2.5;ctx.lineJoin="round";
  ctx.strokeStyle="rgba(0,245,212,.95)";ctx.setLineDash([8,6]);ctx.beginPath();
  for(x=0;x<=W;x+=4){
    var m=Smod(hdc+Math.atan((x-W/2)/f)/R);
    if(m===null){dib=false;continue}
    var y=H/2-f*Math.tan(m-pr);
    if(dib)ctx.lineTo(x,y);else{ctx.moveTo(x,y);dib=true}
  }
  ctx.stroke();ctx.setLineDash([]);
  var v=$("cam");
  if(hzDet&&Date.now()-hzDet.t<3000&&v.videoWidth&&zoom<=1.05){
    var vw=v.videoWidth,vh=v.videoHeight,s=Math.max(W/vw,H/vh);
    ctx.strokeStyle=hzDet.ok?"rgba(255,226,89,.9)":"rgba(255,255,255,.35)";ctx.beginPath();
    for(x=0;x<hzDet.w;x++){
      var sx=W/2+((x+0.5)*vw/hzDet.w-vw/2)*s,sy=H/2+(hzDet.y[x]*vh/hzDet.h-vh/2)*s;
      if(x)ctx.lineTo(sx,sy);else ctx.moveTo(sx,sy);
    }
    ctx.stroke();
  }
}
function motivoErr(e){
  var m=e&&e.message||"";
  if(e&&e.name==="AbortError")return "tiempo agotado";
  if(/limit exceeded|too many requests|429/i.test(m))return "límite de consultas alcanzado, se reintenta solo";
  if(m&&m!=="Load failed"&&m!=="Failed to fetch")return m;
  return "sin conexión o bloqueado";
}
$("probar").onclick=async function(){
  var B=$("probar"),RES=$("probres");
  if(B.disabled)return;
  B.disabled=true;RES.textContent="Probando el servicio de relieve (Open-Meteo)…";
  var la=[37.13,37.14],lo=[-3.7,-3.69],out=[],ok=false,pruebas=[["Open-Meteo",viaOM]];
  try{
    for(var i=0;i<pruebas.length;i++){
      try{
        var a=await pruebas[i][1](la,lo);
        out.push("✓ "+pruebas[i][0]+": funciona");ok=true;
      }catch(e){out.push("✗ "+pruebas[i][0]+": "+motivoErr(e))}
      RES.innerHTML=out.map(esc).join("<br>")+(i<pruebas.length-1?"<br>Probando…":"");
    }
    if(ok){bloqRel=0;errRel=""}
    RES.innerHTML=out.map(esc).join("<br>")+"<br>"+(ok?"✓ Relieve disponible":"✗ Sin datos de relieve: comprueba la conexión");
  }catch(e){RES.textContent="Error en la prueba: "+motivoErr(e)}
  B.disabled=false;
};
// ================= Añadir lugares y actualizar desde OpenStreetMap =================
var TIPO_ETQ={city:"Ciudad",town:"Villa o ciudad pequeña",village:"Pueblo",hamlet:"Aldea",isolated_dwelling:"Caserío",peak:"Pico"};
var TIPO_OSM={city:"city",town:"town",village:"village",hamlet:"hamlet",isolated_dwelling:"isolated_dwelling"};
function tipoOSM(v){return TIPO_OSM[v]||"hamlet"}
function lugarDesde(la,lo,az,km){
  var c=Math.max(0.05,Math.cos(la*R));
  return [la+km*Math.cos(az*R)/111.32,lo+km*Math.sin(az*R)/(111.32*c)];
}
function fmtKm(d){return d<1?Math.round(d*1000)+" m":d.toFixed(d<10?1:0)+" km"}
function plural(n,s,p){return n+" "+(n===1?s:p)}
// Índice rápido para no repetir lugares que ya están en la base
function indexarPuntos(lista,kmNom){
  var nom={},g=new Map(),G=0.1;
  function key(i,j){return i*4000+j}
  function add(q){
    var k=normNombre(q[0]);(nom[k]=nom[k]||[]).push(q);
    var c=key(Math.floor(q[1]/G),Math.floor(q[2]/G)),a=g.get(c);
    if(a)a.push(q);else g.set(c,[q]);
  }
  lista.forEach(add);
  return{
    hay:function(n,la,lo){
      var nn=normNombre(n),a=nom[nn]||[],i;
      for(i=0;i<a.length;i++)if(dst(la,lo,a[i][1],a[i][2])<kmNom)return true;
      var i0=Math.floor((la-0.006)/G),i1=Math.floor((la+0.006)/G),j0=Math.floor((lo-0.006)/G),j1=Math.floor((lo+0.006)/G);
      for(i=i0;i<=i1;i++)for(var j=j0;j<=j1;j++){
        var c=g.get(key(i,j));
        if(c)for(var k=0;k<c.length;k++)if(dst(la,lo,c[k][1],c[k][2])<0.3)return true;
      }
      return false;
    },
    add:add
  };
}
// Pide a varios servidores Overpass a la vez y devuelve el primero que responda.
// Se usa CSV (no JSON): la respuesta pesa mucho menos y llega antes.
function parseOSM(t){
  var out=[];
  t.split("\n").forEach(function(l){
    l=l.trim();if(!l)return;
    var k=l.split("|");
    if(k.length<5)return;
    var la=parseFloat(k[0]),lo=parseFloat(k[1]),n=(k[2]||"").trim(),pl=(k[3]||"").trim(),nat=(k[4]||"").trim();
    if(!isFinite(la)||!isFinite(lo)||!n)return;
    if(nat==="peak"){
      var e=parseFloat(String(k[5]||"").replace(",","."));
      out.push({n:n,la:la,lo:lo,pk:1,e:isFinite(e)&&e>0?Math.round(e):0});
    }else if(pl){
      out.push({n:n,la:la,lo:lo,t:tipoOSM(pl)});
    }
  });
  return out;
}
function pedirOSM(q){
  var sv=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass.private.coffee/api/interpreter","https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
  return new Promise(function(res,rej){
    var pend=sv.length,fallos=[];
    sv.forEach(function(u,i){
      setTimeout(function(){
        fetchT(u,{method:"POST",body:"data="+encodeURIComponent(q)},55000)
          .then(function(r){if(!r.ok)throw new Error("error "+r.status);return r.text()})
          .then(function(t){var o=parseOSM(t);if(!o.length)throw new Error("respuesta vacía");res(o)})
          .catch(function(e){fallos.push(u.split("/")[2]+": "+motivoErr(e));if(--pend===0)rej(fallos)});
      },i*1200);
    });
  });
}
function consultaOSM(la,lo){
  var p=la.toFixed(5)+","+lo.toFixed(5);
  return '[out:csv(::lat,::lon,name,place,natural,ele;false;"|")][timeout:50];(node["place"~"^(city|town|village|hamlet|isolated_dwelling|locality)$"]["name"](around:15000,'+p+');node["natural"="peak"]["name"](around:50000,'+p+'););out;';
}
function osmEstado(t){
  try{$("osmres").textContent=t}catch(e){}
  try{$("aosmres").textContent=t}catch(e){}
}
async function actualizarOSM(btnId){
  var B=$(btnId||"osmact"),P0=pos||ultimaPos;
  if(!P0){osmEstado("Primero activa la ubicación («Iniciar identificación»).");return}
  if(B&&B.disabled)return;
  if(B)B.disabled=true;
  osmEstado("Consultando OpenStreetMap (15 km alrededor y picos hasta 50 km)…");
  try{
    var els=await pedirOSM(consultaOSM(P0.latitude,P0.longitude));
    // La base de picos incluida sirve para no volver a añadir los que ya están
    if(!PKALL&&!window.DATOS_PICOS)await cargarPicosBase();
    var basePk=picosCerca(P0.latitude,P0.longitude,80);
    var existentes=(BD||[]).concat(BASE).concat(MIS.filter(function(m){return !m.pk}).map(function(m){return[m.n,m.la,m.lo,m.t||"hamlet"]})).concat(OSMX.filter(function(m){return !m.pk}).map(function(m){return[m.n,m.la,m.lo,m.t||"hamlet"]}));
    var ix=indexarPuntos(existentes,2);
    var picosYa=basePk.concat(misPicos()).concat(OSMX.filter(function(m){return m.pk}).map(function(m){return[m.n,m.la,m.lo,m.e]}));
    var ixPk=indexarPuntos(picosYa,3);
    var nuevos=[],picos=[],sinAlt=0;
    els.forEach(function(q){
      if(q.pk){
        if(ixPk.hay(q.n,q.la,q.lo))return;
        ixPk.add([q.n,q.la,q.lo,q.e]);picos.push(q);
      }else{
        if(ix.hay(q.n,q.la,q.lo))return;
        ix.add([q.n,q.la,q.lo,q.t]);nuevos.push(q);
      }
    });
    // Picos sin etiqueta «ele»: se pide la altura a Open-Meteo (máx. 300)
    var faltan=picos.filter(function(q){return !q.e}).slice(0,300);
    for(var i=0;i<faltan.length;i+=100){
      var lote=faltan.slice(i,i+100);
      var al=await altitudes(lote.map(function(q){return q.la.toFixed(5)}),lote.map(function(q){return q.lo.toFixed(5)}));
      if(!al)break;
      lote.forEach(function(q,j){var v=al.h&&al.h[j];if(isFinite(v)&&v>0)q.e=Math.round(v)});
    }
    picos=picos.filter(function(q){if(q.e>0)return true;sinAlt++;return false});
    var nN=nuevos.length,nP=picos.length;
    OSMX=OSMX.concat(nuevos).concat(picos);
    if(OSMX.length>4000)OSMX=OSMX.slice(-4000);
    guardarAgregados();
    BDlisto=true;P=unir();
    if(nP){pkCentro=null;pkProx=0;pkCargando=false;if(verPicos)cargarPicos()}
    pintar();pintarLista();
    var total=nN+nP,partes=[];
    if(nN)partes.push(plural(nN,"pueblo","pueblos")+(nN===1?" nuevo":" nuevos"));
    if(nP)partes.push(plural(nP,"pico","picos")+(nP===1?" nuevo":" nuevos"));
    osmEstado(total?("✓ OpenStreetMap: "+partes.join(" y ")+(sinAlt?" ("+plural(sinAlt,"pico","picos")+" sin altura no añadidos)":"")+"."):"OpenStreetMap no tiene nada nuevo alrededor: ya estaba todo en la app.");
    if(document.body.classList.contains("on"))avisar(total?"➕ Añadidos "+partes.join(" y ")+" de OpenStreetMap":"OpenStreetMap: no hay nada nuevo alrededor",5000);
  }catch(e){
    var m=Array.isArray(e)?e[0]:((e&&e.message)||motivoErr(e));
    osmEstado("No se pudo consultar OpenStreetMap: "+m+".");
  }finally{
    if(B)B.disabled=false;
  }
}
// ---- Ventana «Añadir un lugar» ----
var aModo="desde",aTimer=null;
function aEstado(t){try{$("aest").textContent=t}catch(e){}}
function tipoSel(){return $("atipo").value}
function actTipo(){
  var pk=tipoSel()==="peak";
  $("aaltc").classList.toggle("oculto",!pk);
  if(!pk)$("aalt").value="";
}
function ponerModo(m){
  aModo=m;
  $("amodo1").classList.toggle("on",m==="desde");
  $("amodo2").classList.toggle("on",m==="coord");
  $("amodo1").setAttribute("aria-pressed",m==="desde"?"true":"false");
  $("amodo2").setAttribute("aria-pressed",m==="coord"?"true":"false");
  $("adesde").classList.toggle("oculto",m!=="desde");
  $("acoord").classList.toggle("oculto",m!=="coord");
}
function actCursor(){
  var c=$("acur");if(!c)return;
  var P0=pos||ultimaPos;
  if(!P0){c.textContent="Sin ubicación: activa «Iniciar identificación» para usar el rumbo y la distancia, o elige «Con coordenadas».";return}
  var pre=(P0.accuracy?"GPS ±"+Math.round(P0.accuracy)+" m":"GPS")+(pos?"":" · última posición conocida");
  c.textContent="Ahora apuntas a "+Math.round(rumboC())+"° · "+pre+".";
}
function pintarLista(){
  var L=$("alista");if(!L)return;
  L.innerHTML="";
  $("aborrarosm").hidden=!OSMX.length;
  if(!MIS.length&&!OSMX.length){
    L.innerHTML='<p class="nada">Todavía no has añadido ningún lugar.</p>';
  }else if(!MIS.length){
    L.innerHTML='<p class="nada">Solo hay '+OSMX.length+' lugares traídos de OpenStreetMap.</p>';
  }
  MIS.forEach(function(m,i){
    var fila=document.createElement("div");fila.className="item";
    var s=document.createElement("span");
    var P0=pos||ultimaPos,d=P0?dst(P0.latitude,P0.longitude,m.la,m.lo):null;
    s.innerHTML="<b>"+esc(m.n)+"</b><small>"+esc(TIPO_ETQ[m.pk?"peak":(m.t||"hamlet")]||"Lugar")+(d!==null?" · "+fmtKm(d):"")+"</small>";
    var b=document.createElement("button");
    b.type="button";b.title="Quitar este lugar";b.setAttribute("aria-label","Quitar "+m.n);b.textContent="🗑";
    b.onclick=function(){quitarMio(i)};
    fila.appendChild(s);fila.appendChild(b);L.appendChild(fila);
  });
}
function quitarMio(i){
  var m=MIS[i];if(!m)return;
  MIS.splice(i,1);guardarAgregados();
  BDlisto=true;P=unir();
  if(m.pk){pkCentro=null;pkProx=0;pkCargando=false;if(verPicos)cargarPicos()}
  pintar();pintarLista();aEstado("Quitado: "+m.n+".");
}
function abrirAnadir(){
  $("anadir").style.display="flex";
  $("aest").textContent="";$("aosmres").textContent="";
  actTipo();
  var P0=pos||ultimaPos;
  if(P0){ponerModo("desde");$("arumbo").value=Math.round(rumboC())%360}
  else ponerModo("coord");
  if(P0&&!$("alat").value){$("alat").value=P0.latitude.toFixed(6);$("alon").value=P0.longitude.toFixed(6)}
  actCursor();pintarLista();
  clearInterval(aTimer);aTimer=setInterval(actCursor,800);
}
function cerrarAnadir(){
  clearInterval(aTimer);aTimer=null;
  $("anadir").style.display="none";
}

$("invActivar").onclick=activarInv;
$("invCerrar").onclick=desactivarInv;
$("invTipo").onchange=function(){if(pos)llenarInvDest();};

$("anadirb").onclick=abrirAnadir;
$("anadircam").onclick=abrirAnadir;
$("acerra").onclick=cerrarAnadir;
$("amodo1").onclick=function(){ponerModo("desde")};
$("amodo2").onclick=function(){ponerModo("coord")};
$("atipo").onchange=actTipo;
$("ausar").onclick=function(){
  if(!pos){aEstado("La brújula está apagada o no hay GPS. Activa la identificación para usar el rumbo actual.");return}
  $("arumbo").value=Math.round(rumboC())%360;actCursor();
  aEstado("Rumbo puesto: "+Math.round(rumboC())+"°.");
};
$("aqui").onclick=function(){
  var P0=pos||ultimaPos;
  if(!P0){aEstado("No tengo ninguna posición. Activa la ubicación.");return}
  $("alat").value=P0.latitude.toFixed(6);$("alon").value=P0.longitude.toFixed(6);
  aEstado(pos?"Posición puesta.":"Puesta la última posición conocida.");
};
$("osmact").onclick=function(){actualizarOSM("osmact")};
$("aosm").onclick=function(){actualizarOSM("aosm")};
$("aborrarosm").onclick=function(){
  if(!OSMX.length)return;
  OSMX=[];guardarAgregados();BDlisto=true;P=unir();
  pkCentro=null;pkProx=0;pkCargando=false;if(verPicos)cargarPicos();
  pintar();pintarLista();aEstado("Borrados los lugares traídos de OpenStreetMap.");
};
$("aadd").onclick=async function(){
  var B=this;
  if(B.disabled)return;
  var n=$("anom").value.trim(),tipo=tipoSel(),pk=tipo==="peak";
  if(!n){aEstado("Escribe un nombre.");$("anom").focus();return}
  var P0=pos||ultimaPos,la,lo;
  if(aModo==="desde"){
    if(!P0){aEstado("Sin ubicación no puedo calcular el sitio. Usa «Con coordenadas».");return}
    var az=parseFloat($("arumbo").value),km=parseFloat(String($("adist").value).replace(",","."));
    if(!isFinite(az)||az<0||az>360){aEstado("El rumbo tiene que estar entre 0 y 360 grados.");return}
    if(!isFinite(km)||km<=0){aEstado("Pon una distancia en km mayor que 0.");return}
    if(km>80){aEstado("La app solo muestra lugares hasta 80 km. Pon una distancia menor.");return}
    var q=lugarDesde(P0.latitude,P0.longitude,az,km);la=q[0];lo=q[1];
  }else{
    la=parseFloat(String($("alat").value).replace(",","."));
    lo=parseFloat(String($("alon").value).replace(",","."));
    if(!isFinite(la)||!isFinite(lo)||la<-90||la>90||lo<-180||lo>180){aEstado("Latitud o longitud no válidas.");return}
  }
  B.disabled=true;
  var alt=parseFloat(String($("aalt").value).replace(",","."));
  if(pk){
    if(!isFinite(alt)||alt<=0){
      aEstado("No has puesto altura: la busco…");
      try{var al=await altitudes([la.toFixed(5)],[lo.toFixed(5)]);if(al&&al.h&&isFinite(al.h[0])&&al.h[0]>0)alt=Math.round(al.h[0])}catch(e){}
    }
    if(!isFinite(alt)||alt<=0){B.disabled=false;aEstado("Los picos necesitan altura. Escríbela en metros o inténtalo con conexión.");return}
  }
  var m={n:n,la:+la.toFixed(6),lo:+lo.toFixed(6)};
  if(pk){m.pk=1;m.e=Math.round(alt)}else m.t=tipo;
  MIS.push(m);guardarAgregados();
  BDlisto=true;P=unir();
  if(pk){pkCentro=null;pkProx=0;pkCargando=false;if(verPicos)cargarPicos()}
  pintar();pintarLista();
  var P1=pos||ultimaPos,dP=P1?dst(P1.latitude,P1.longitude,m.la,m.lo):null;
  aEstado("✓ Añadido: "+m.n+(dP!==null?" ("+fmtKm(dP)+")":"")+".");
  $("anom").value="";$("aalt").value="";
  B.disabled=false;
  infoCam("➕ Añadido: "+m.n);
};
var iniciando=false,iniciarTimer=null;
async function iniciar(){
  if(iniciando||watchId!==null)return;
  iniciando=true;$("go").disabled=true;$("go").style.opacity=".7";
  clearTimeout(iniciarTimer);
  iniciarTimer=setTimeout(function(){
    if(!watchId&&!document.body.classList.contains("on")){
      iniciando=false;$("go").disabled=false;$("go").style.opacity="";
      $("msg").textContent="Está tardando mucho en conseguir los permisos o la ubicación. Comprueba que el GPS y los permisos estén activados y vuelve a intentarlo.";
    }
  },45000);
  try{await iniciar2()}finally{
    clearTimeout(iniciarTimer);
    if(watchId===null){iniciando=false;$("go").disabled=false;$("go").style.opacity=""}
  }
}
function pedirPos(opts,ms){
  return new Promise(function(res){
    var hecho=false;
    var fin=function(v){if(hecho)return;hecho=true;res(v)};
    var t=setTimeout(function(){fin({error:{code:3,message:"tiempo agotado"}})},ms||15000);
    try{
      if(!navigator.geolocation||!navigator.geolocation.getCurrentPosition){clearTimeout(t);fin({error:{code:2,message:"sin geolocalización"}});return}
      navigator.geolocation.getCurrentPosition(function(p){clearTimeout(t);fin(p)},function(e){clearTimeout(t);fin({error:e||{code:2,message:"error"}})},opts||{});
    }catch(e){clearTimeout(t);fin({error:{code:2,message:e&&e.message||"error"}})}
  });
}
// Alternativa: algunas WebView/navegadores en Android dan la primera posición por watchPosition
function pedirPosWatch(opts,ms){
  return new Promise(function(res){
    var hecho=false,id=null;
    var fin=function(v){if(hecho)return;hecho=true;try{if(id!==null)navigator.geolocation.clearWatch(id)}catch(e){}res(v)};
    var t=setTimeout(function(){fin({error:{code:3,message:"tiempo agotado"}})},ms||15000);
    try{
      if(!navigator.geolocation||!navigator.geolocation.watchPosition){clearTimeout(t);fin({error:{code:2,message:"sin geolocalización"}});return}
      id=navigator.geolocation.watchPosition(function(p){clearTimeout(t);fin(p)},function(e){clearTimeout(t);fin({error:e||{code:2,message:"error"}})},opts||{});
    }catch(e){clearTimeout(t);fin({error:{code:2,message:e&&e.message||"error"}})}
  });
}
function msgSinPermisoUbic(){
  return window.AndroidApp
    ?"Sin permiso de ubicación. Ve a Ajustes de Android > Aplicaciones > ¿Qué pueblo es? > Permisos > Ubicación y permítelo (mejor «Solo al usar la app»), con la ubicación del móvil activada."
    :"Sin permiso de ubicación. Actívalo en los ajustes del navegador o del móvil (icono del candado del sitio) y vuelve a intentarlo.";
}
function msgSinUbic(e){
  var c=e&&e.code;
  if(c===1)return msgSinPermisoUbic();
  if(c===2)return "La ubicación no está disponible ahora. Activa la ubicación/GPS del móvil, sal al exterior si estás bajo techo y vuelve a intentarlo.";
  return "No pude obtener la ubicación (tardó demasiado). Activa el GPS/ubicación del móvil, sal al exterior y vuelve a intentarlo.";
}
async function iniciar2(){
  $("msg").textContent="Comprobando permisos…";
  try{
    if(typeof DeviceOrientationEvent!=="undefined"&&typeof DeviceOrientationEvent.requestPermission==="function"){
      var s=await DeviceOrientationEvent.requestPermission();
      if(s!=="granted"){$("msg").textContent="El iPhone ha denegado el acceso a la brújula (estado: "+s+"). Abre esta página en Safari, no dentro de otra app.";return}
    }
  }catch(e){$("msg").textContent="Error de brújula: "+(e&&e.message?e.message:e)+". Abre esta página directamente en Safari.";return}
  if(!navigator.geolocation){$("msg").textContent="Este navegador no tiene GPS.";return}
  $("msg").textContent="Obteniendo tu ubicación… (acepta el permiso si te lo pide)";
  // Varios intentos: rápido (red/caché) → alta precisión → watchPosition → permisivo
  var intentos=[
    {opts:{enableHighAccuracy:false,timeout:10000,maximumAge:300000},ms:11000,txt:"Obteniendo tu ubicación…"},
    {opts:{enableHighAccuracy:true,timeout:15000,maximumAge:60000},ms:16000,txt:"Afinando la ubicación (GPS)…"},
    {watch:1,opts:{enableHighAccuracy:false,timeout:15000,maximumAge:300000},ms:16000,txt:"Buscando ubicación…"},
    {opts:{enableHighAccuracy:true,timeout:20000,maximumAge:0},ms:21000,txt:"Intentando de nuevo con GPS…"}
  ];
  function posDesdeAndroid(){
    try{
      if(!window.AndroidApp||!AndroidApp.ubicacion)return null;
      var s=AndroidApp.ubicacion(); if(!s)return null;
      var k=s.split(","); var la=+k[0],lo=+k[1],ac=+k[2],al=+k[3];
      if(!isFinite(la)||!isFinite(lo)||Math.abs(la)>90||Math.abs(lo)>180)return null;
      if(la===0&&lo===0)return null;
      return {coords:{latitude:la,longitude:lo,accuracy:isFinite(ac)?ac:200,altitude:isFinite(al)?al:null,altitudeAccuracy:null,heading:null,speed:null}};
    }catch(e){return null}
  }
  var p0=null,denegado=false;
  // En la app Android, prueba primero la última ubicación conocida del sistema
  if(window.AndroidApp){ p0=posDesdeAndroid(); }
  for(var i=0;(!p0||p0.error)&&i<intentos.length;i++){
    $("msg").textContent=intentos[i].txt+" (acepta el permiso si te lo pide)";
    p0=intentos[i].watch?await pedirPosWatch(intentos[i].opts,intentos[i].ms):await pedirPos(intentos[i].opts,intentos[i].ms);
    if(p0&&!p0.error)break;
    if(p0&&p0.error&&p0.error.code===1){denegado=true;break}
    // reintento con ubicación del sistema en Android
    if(window.AndroidApp){ var pa=posDesdeAndroid(); if(pa){p0=pa;break} }
  }
  if(window.AndroidApp&&(!p0||p0.error)){ var pa2=posDesdeAndroid(); if(pa2)p0=pa2; }
  if(!p0||p0.error){$("msg").textContent=msgSinUbic(p0&&p0.error);return}
  (function(p){
    pos=p.coords;ultimaPos=pos;posT=Date.now();$("go").style.display="none";$("msg").textContent="Ubicación obtenida.";
    masPueblos();document.body.classList.add("on");camara();pantallaEncendida(true);consejosPrimeraVez();
    // Sigue tu posición y recarga los pueblos al alejarte 30 km de la última descarga
    watchId=navigator.geolocation.watchPosition(function(q){
      pos=q.coords;ultimaPos=pos;posT=Date.now();actualizarMarcha(q.coords);calAndar(q.coords);
      if(!ultimo||dst(pos.latitude,pos.longitude,ultimo.la,ultimo.lo)>30)masPueblos();
      if(verPicos)cargarPicos();
    },function(e){
      // Antes se ignoraba: ahora se avisa (como mucho cada 20 s) para que no se use una posición vieja sin saberlo
      if(Date.now()-gpsAvT<20000)return;gpsAvT=Date.now();
      avisar(e.code===1?"📍 Se ha retirado el permiso de ubicación: los resultados no se actualizarán.":"📍 Señal GPS perdida: uso la última posición conocida.",6000);
    },{enableHighAccuracy:true,maximumAge:5000});
    oriT0=Date.now();setTimeout(pintar,4500);
    window.addEventListener("deviceorientationabsolute",onOri,true);
    window.addEventListener("deviceorientation",onOri,true);
  })(p0);
}
var gpsAvT=0;
// Antes de pedir permisos, la primera vez se explica para qué sirve cada uno
$("go").onclick=function(){
  if(iniciando||watchId!==null)return;
  var visto=false;try{visto=localStorage.getItem("permisosVistos")==="1"}catch(e){}
  if(visto){iniciar();return}
  // Si el aviso ya está en pantalla, seguir con los permisos
  if($("permisos").style.display==="flex"){$("permok").onclick();return}
  $("permisos").style.display="flex";$("permok").focus();
};
var permInicio=false;
$("permok").onclick=function(){
  $("permisos").style.display="none";
  try{localStorage.setItem("permisosVistos","1")}catch(e){}
  // Si se mostró al abrir la app, los permisos se piden después al pulsar «Iniciar identificación»
  if(permInicio){permInicio=false;return}
  iniciar();
};
$("permno").onclick=function(){$("permisos").style.display="none";permInicio=false};
// Primera vez que se abre la app: lo primero que se ve es qué permisos hacen falta y por qué
(function(){
  var visto=false;try{visto=localStorage.getItem("permisosVistos")==="1"}catch(e){}
  if(visto)return;
  permInicio=true;$("permisos").style.display="flex";$("permok").focus();
})();
// ---- Arranque de la interfaz ----
(function arrancarUI(){
  var c=$("cargando");
  if(c){c.style.display="none"}
  var g=$("go");
  if(g){g.disabled=false;g.setAttribute("aria-busy","false");g.innerHTML='<span class="go1">Iniciar identificación</span><span class="go2">Activar GPS y brújula mientras se usa</span>'}
})();
// ---- App instalable: guarda la página para abrirla sin conexión ----
if("serviceWorker" in navigator&&location.protocol!=="file:"&&!window.AndroidApp)window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){})});
})();