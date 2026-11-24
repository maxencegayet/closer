/* Closer · Geste « glisser vers le bas pour fermer » et lancement de l'appli. Ce fichier doit rester le dernier chargé. */
"use strict";
/* ---------- fiche : glisser vers le bas pour fermer, comme sur iOS ---------- */
(function(){
  var sh=$("sheet"), sc=document.querySelector(".scrim");
  var ys=0, xs=0, y0=0, t0=0, dy=0, drag=false, armed=false;
  // pas de fermeture depuis un champ ni depuis une rangée qui défile de côté (dates, catégories…)
  function noDrag(t){return !!(t&&t.closest&&t.closest("input,textarea,select,[contenteditable],.chips.scroll,.segc"));}
  function begin(y){drag=true;y0=y;t0=Date.now();dy=0;sh.classList.add("dragging");document.body.classList.add("sheet-drag");}
  function move(y){
    dy=y-y0;
    var d=dy<0?-Math.pow(-dy,0.7):dy;                       /* frottement si on tire vers le haut */
    sh.style.transform="translateY("+d+"px)";
    sc.style.opacity=String(Math.max(0,1-Math.max(0,dy)/((sh.offsetHeight||600)*1.2)));
  }
  function end(){
    if(!drag)return;drag=false;armed=false;
    var dt=Math.max(1,Date.now()-t0), v=dy/dt;
    sh.classList.remove("dragging");document.body.classList.remove("sheet-drag");sc.style.opacity="";
    if(dy>0&&(dy>(sh.offsetHeight||600)*0.28||v>0.11)){closeSheet();}  /* un geste rapide suffit */
    sh.style.transform="";
  }
  sh.addEventListener("touchstart",function(e){
    if(!sheet||e.touches.length!==1||noDrag(e.target)){armed=false;return;}
    armed=sh.scrollTop<=0;ys=e.touches[0].clientY;xs=e.touches[0].clientX;
  },{passive:true});
  sh.addEventListener("touchmove",function(e){
    if(!sheet||!armed)return;
    if(e.touches.length!==1){end();return;}               /* un deuxième doigt : on ne suit pas */
    var y=e.touches[0].clientY, x=e.touches[0].clientX, ddx=Math.abs(x-xs), ddy=y-ys;
    if(!drag){
      if(ddx>8&&ddx>Math.abs(ddy)){armed=false;return;}          /* geste de côté : ce n'est pas une fermeture */
      if(ddy>10&&ddy>ddx*1.5&&sh.scrollTop<=0){begin(y);}        /* nettement vers le bas */
      else if(-ddy>6){armed=false;return;} else return;
    }
    e.preventDefault();move(y);
  },{passive:false});
  sh.addEventListener("touchend",end);
  sh.addEventListener("touchcancel",end);
})();

route();render();
if(navigator.storage&&navigator.storage.persist){navigator.storage.persist().catch(function(){});}
if("serviceWorker" in navigator&&location.protocol==="https:"){navigator.serviceWorker.register("sw.js").catch(function(){});}
// notification touchée alors que Closer était déjà ouvert : le service worker dit quoi montrer
if("serviceWorker" in navigator)navigator.serviceWorker.addEventListener("message",function(e){
  var h=e.data&&e.data.open;if(typeof h!=="string"||h.charAt(0)!=="#")return;
  goOpen(h);takeOpen();
});
// la même demande, gardée par le service worker : prise au lancement et à chaque retour dans l'appli
// (sur iPhone, le message ci-dessus se perd souvent quand Closer était en pause)
var OPEN_CACHE="ouvrir-closer";
function goOpen(h){lastOpen={h:h,t:Date.now()};if(location.hash===h)route();else location.hash=h;}
function takeOpen(){
  if(!window.caches)return;
  var key=new URL("__ouvrir",document.baseURI).href;
  caches.open(OPEN_CACHE).then(function(c){return c.match(key).then(function(r){
    if(!r)return;
    return r.json().then(function(o){
      c.delete(key);
      if(!o||typeof o.h!=="string"||o.h.charAt(0)!=="#"||Date.now()-o.at>10*60000)return;
      if(lastOpen&&lastOpen.h===o.h&&lastOpen.t>=o.at)return;   // déjà ouvert par le lien ou le message
      goOpen(o.h);
    });
  });}).catch(function(e){logErr("notification",e);});
}
takeOpen();
document.addEventListener("visibilitychange",function(){if(!document.hidden)takeOpen();});
localMode();

/* stockage durable : demande au navigateur de ne pas effacer les données de Closer (Safari peut le faire sinon) */
try{if(navigator.storage&&navigator.storage.persisted)navigator.storage.persisted().then(function(p){if(!p&&navigator.storage.persist)return navigator.storage.persist();}).catch(function(e){logErr("stockage",e);});}catch(e){}

/* glisser une tâche : vers la droite = fait, vers la gauche = demain (Jour et Tâches) */
(function(){
  var row=null,id=null,x0=0,y0=0,dx=0,mode=0,bg=null,w=0;   // mode 0 = pas encore décidé, 1 = glissement
  function thr(){return Math.min(110,w*0.3);}
  function reset(){
    if(!row)return;var r=row,b=bg;row=null;bg=null;
    r.style.transition="transform 200ms var(--ease-out)";r.style.transform="";
    setTimeout(function(){r.style.transition="";r.classList.remove("swiping");if(b)b.remove();},210);
  }
  function paint(){
    var right=dx>0;
    bg.className="swbg "+(right?"done":"later")+(Math.abs(dx)>=thr()?" far":"");
    bg.textContent=right?"Fait":"Demain";
  }
  document.addEventListener("touchstart",function(e){
    if(row||e.touches.length!==1||sheet)return;
    var r=e.target.closest&&e.target.closest(".row");
    if(!r||r.classList.contains("done")||!r.closest("#l-jour,#l-tasks")||r.querySelector(".mvs"))return;
    var c=r.querySelector('[data-act="task"]');if(!c)return;
    row=r;id=c.dataset.id;x0=e.touches[0].clientX;y0=e.touches[0].clientY;dx=0;mode=0;w=r.offsetWidth;
  },{passive:true});
  document.addEventListener("touchmove",function(e){
    if(!row)return;
    var x=e.touches[0].clientX,y=e.touches[0].clientY;
    if(mode===0){
      if(Math.abs(y-y0)>8&&Math.abs(y-y0)>=Math.abs(x-x0)){row=null;return;}   // défilement vertical : on laisse faire
      if(Math.abs(x-x0)<12)return;
      mode=1;bg=document.createElement("div");bg.setAttribute("aria-hidden","true");
      bg.style.top=row.offsetTop+"px";bg.style.height=row.offsetHeight+"px";
      row.parentElement.insertBefore(bg,row.parentElement.firstChild);row.classList.add("swiping");
    }
    dx=x-x0;row.style.transform="translateX("+dx+"px)";paint();
  },{passive:true});
  document.addEventListener("touchend",function(){
    if(!row)return;
    if(mode!==1){row=null;return;}
    if(Math.abs(dx)<thr()){reset();return;}
    var r=row,b=bg,i=id,d=dx;row=null;bg=null;
    r.style.transition="transform 170ms var(--ease-out)";r.style.transform="translateX("+(d>0?w:-w)+"px)";
    try{haptic();}catch(e){}
    setTimeout(function(){if(b)b.remove();if(d>0)taskDone(i);else taskTomorrow(i);},160);
  },{passive:true});
  document.addEventListener("touchcancel",reset,{passive:true});
})();
