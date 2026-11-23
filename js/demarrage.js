/* Closer · Geste « glisser vers le bas pour fermer » et lancement de l'appli. Ce fichier doit rester le dernier chargé. */
"use strict";
/* ---------- fiche : glisser vers le bas pour fermer, comme sur iOS ---------- */
(function(){
  var sh=$("sheet"), sc=document.querySelector(".scrim");
  var ys=0, y0=0, t0=0, dy=0, drag=false, armed=false;
  function noDrag(t){return !!(t&&t.closest&&t.closest("input,textarea,select,[contenteditable]"));}
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
    armed=sh.scrollTop<=0;ys=e.touches[0].clientY;
  },{passive:true});
  sh.addEventListener("touchmove",function(e){
    if(!sheet||!armed)return;
    if(e.touches.length!==1){end();return;}               /* un deuxième doigt : on ne suit pas */
    var y=e.touches[0].clientY;
    if(!drag){ if(y-ys>6&&sh.scrollTop<=0){begin(y);} else if(ys-y>6){armed=false;return;} else return; }
    e.preventDefault();move(y);
  },{passive:false});
  sh.addEventListener("touchend",end);
  sh.addEventListener("touchcancel",end);
})();

route();render();
if(navigator.storage&&navigator.storage.persist){navigator.storage.persist().catch(function(){});}
if("serviceWorker" in navigator&&location.protocol==="https:"){navigator.serviceWorker.register("sw.js").catch(function(){});}
localMode();
