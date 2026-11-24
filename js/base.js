/* Closer · Constantes, état de l'appli, petits outils (dates, échappement HTML), journal des erreurs, stockage local, catégories, lignes de liste. */
"use strict";
var DEFAULT_CATS=["Perso","Job","Courses","Achats","RDV","Autre"];
var TABS=["jour","taches","objectifs","brouillon"];
var MONTHS=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
var CHECK='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var LS_KEY="cap-items-v1";
var KIND_NAME={task:"tâche",hw:"devoir",daily:"habitude",goal:"objectif",step:"étape"};
var KIND_NEW={task:"Nouvelle tâche",hw:"Nouveau devoir",daily:"Nouvelle habitude",goal:"Nouvel objectif"};
var KIND_HINT={
  task:"Une chose à faire une fois, avec ou sans date.",
  hw:"Un travail à rendre pour un cours, classé par matière.",
  daily:"Une habitude à tenir chaque jour, ou un certain nombre de fois par semaine.",
  goal:"Un cap sur plusieurs semaines ou mois, que tu découpes en étapes."
};

var state={items:new Map(),filter:"Tout",tmenu:false,day:"",showDone:{taches:false,devoirs:false},arr:{taches:false,devoirs:false},mode:"loading",note:"",nfolder:"Toutes",nq:"",noteOpen:null};
var dirty={}, noteTimers={}, lastNoteIds=null;
var lastDeleted=null, toastTimer=null, focusAfter=null;
var sheet=null, sheetOpener=null, orderGroups={}, orderModes={};
var prevPct={}, prevDone=null, curView=null, EASE="cubic-bezier(0.23,1,0.32,1)";
var reduce=window.matchMedia?window.matchMedia("(prefers-reduced-motion: reduce)"):{matches:false};

function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function cap(s){s=String(s==null?"":s);return s?s.charAt(0).toLocaleUpperCase("fr-FR")+s.slice(1):s;}
function pad(n){return n<10?"0"+n:""+n;}
function iso(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function parse(s){var p=String(s).split("-");return new Date(+p[0],+p[1]-1,+p[2]);}
function today(){return iso(new Date());}
function shift(s,n){var d=parse(s);d.setDate(d.getDate()+n);return iso(d);}
function diffDays(a,b){return Math.round((parse(a)-parse(b))/864e5);}
function isDate(s){return typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s);}
function fmt(s,opt){return parse(s).toLocaleDateString("fr-FR",opt||{weekday:"short",day:"numeric",month:"short"});}

/* ---------- erreurs : gardées sur l'appareil au lieu d'être avalées ---------- */
var ERR_KEY="closer-errors", storageWarned=false;
function logErr(where,e){
  var m=String((e&&(e.message||e.msg||e.code))||e||"").slice(0,200);
  try{console.error("Closer · "+where,e);}catch(x){}
  try{var l=JSON.parse(localStorage.getItem(ERR_KEY)||"[]");l.push({t:Date.now(),w:where,m:m,v:window.APPV||""});localStorage.setItem(ERR_KEY,JSON.stringify(l.slice(-20)));}catch(x){}
}
// les 5 dernières erreurs, jointes au message « Donner mon avis »
function errReport(){
  try{var l=JSON.parse(localStorage.getItem(ERR_KEY)||"[]").slice(-5);if(!l.length)return "";
    return "\n\nDernières erreurs (pour aider) :\n"+l.map(function(x){return new Date(x.t).toLocaleString("fr-FR")+" · "+x.w+" · "+x.m;}).join("\n");}catch(e){return "";}
}
// stockage plein : on prévient une fois, au lieu de perdre en silence
function storageWarn(){if(storageWarned)return;storageWarned=true;showToast("Mémoire de l'appareil pleine : tes dernières modifications risquent de ne pas être gardées. Exporte une sauvegarde dans Réglages.",true);}
addEventListener("error",function(e){logErr("page",e.error||e.message);});
addEventListener("unhandledrejection",function(e){logErr("promesse",e.reason);});

/* ---------- apparence : clair par défaut, sombre ou comme le téléphone ---------- */
var THEME_KEY="closer-theme", darkMQ=window.matchMedia?matchMedia("(prefers-color-scheme: dark)"):{matches:false};
function themeChoice(){try{var t=localStorage.getItem(THEME_KEY);return t==="dark"||t==="auto"?t:"light";}catch(e){return "light";}}
function applyTheme(){
  var t=themeChoice(), dark=t==="dark"||(t==="auto"&&darkMQ.matches);
  document.documentElement.dataset.theme=t;
  var m=$("theme-color");if(m)m.setAttribute("content",dark?"#000000":"#eff0f2");
}
function setTheme(t){try{if(t==="light")localStorage.removeItem(THEME_KEY);else localStorage.setItem(THEME_KEY,t);}catch(e){}applyTheme();}
if(darkMQ.addEventListener)darkMQ.addEventListener("change",applyTheme);
applyTheme();

/* ---------- stockage ---------- */
function newId(){
  return "l"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
}
function persistLocal(){
  if(state.mode!=="local")return;
  try{localStorage.setItem(LS_KEY,JSON.stringify(Array.from(state.items.entries())));}
  catch(e){logErr("stockage",e);storageWarn();}
  schedSync(1500);
}
function put(id,data){
  state.items.set(id,data);
}
function save(id,data){var isNew=!state.items.has(id);put(id,data);persistLocal();render();if(isNew&&data&&data.kind&&data.kind!=="prefs")stat1("first_item");}
function remove(id){
  clearTimeout(noteTimers[id]);delete dirty[id];
  state.items.delete(id);persistLocal();render();
}
function get(id){var d=state.items.get(id);if(!d)return null;var c=Object.assign({},d);if(Array.isArray(d.steps))c.steps=d.steps.map(function(s){return Object.assign({},s);});return c;}
function byKind(k){var out=[];state.items.forEach(function(d,id){if(d&&d.kind===k)out.push({id:id,d:d});});out.sort(function(a,b){return (a.d.created||0)-(b.d.created||0);});return out;}

/* ---------- catégories ---------- */
function cats(){var p=state.items.get("prefs");return p&&Array.isArray(p.cats)?p.cats.slice():DEFAULT_CATS.slice();}
function allCats(extra){
  var l=cats();
  byKind("task").forEach(function(x){var c=x.d.cat;if(c&&c!=="Devoir"&&l.indexOf(c)<0)l.push(c);});
  if(extra&&extra!=="Devoir"&&l.indexOf(extra)<0)l.push(extra);
  return l;
}
function prefs(){var p=state.items.get("prefs");p=p?Object.assign({},p):{};p.kind="prefs";return p;}
function setCats(l){var p=prefs();p.cats=l;save("prefs",p);}
function groupMode(v){var p=state.items.get("prefs"),g=p&&p.group&&p.group[v];return g==="group"?"group":"date";}
function cleanCat(v){var c=cap(String(v||"").trim()).slice(0,24);return (!c||c==="Tout"||c==="Devoir")?"":c;}

/* ---------- lignes ---------- */
function checkBtn(act,id,on,label,extra,cls){
  return '<button type="button" class="check '+(cls||"")+'" role="checkbox" aria-checked="'+(on?"true":"false")+'" aria-label="'+esc(label)+'" data-act="'+act+'" data-id="'+esc(id)+'"'+(extra||"")+'>'+CHECK+'</button>';
}
function dueSpan(due,done){
  if(!isDate(due))return "";
  var n=diffDays(due,today());
  if(done)return '<span>'+esc(fmt(due))+'</span>';
  if(n<0)return '<span class="late">Retard de '+(-n)+' j</span>';
  if(n===0)return '<span>Aujourd\'hui</span>';
  if(n===1)return '<span>Demain</span>';
  return '<span>'+esc(fmt(due))+'</span>';
}
// date courte, affichée à droite de la ligne (comme le montant sur un relevé)
function sideDue(due,done){
  if(!isDate(due))return "";
  var n=diffDays(due,today());
  if(done)return esc(fmt(due,{day:"numeric",month:"short"}));
  if(n<0)return '<span class="late">Retard '+(-n)+' j</span>';
  if(n===0)return "Aujourd'hui";
  if(n===1)return "Demain";
  if(n<7)return esc(cap(fmt(due,{weekday:"short"})));
  return esc(fmt(due,{day:"numeric",month:"short"}));
}
function taskCat(d){return d.cat==="Devoir"?cap(d.subject||"Devoir"):(d.cat||"");}
// à droite : la date (si la section ne la dit pas déjà) et la catégorie (si le filtre ne la dit pas déjà)
function taskSide(d,hideDate,hideCat){
  var late=isDate(d.due)&&d.due<today()&&!d.done, dt=(!hideDate||late)?sideDue(d.due,d.done):"", c=hideCat?"":esc(taskCat(d));
  if(d.time&&isDate(d.due)&&!d.done&&!late)dt=dt?dt+" · "+esc(d.time):esc(d.time);   // heure du rappel
  if(d.rep&&!d.done)dt=REP_ICON+(dt||"");
  if(goalOf(d)&&!d.done)c=GOAL_ICON+c;                                          // repère : fait avancer un objectif
  if(!dt&&!c)return "";
  return '<span class="side">'+(dt?'<span class="sd">'+dt+'</span>':"")+(c?'<span class="sc">'+c+'</span>':"")+'</span>';
}
/* objectif relié à une tâche (s'il existe encore) */
function goalOf(d){var g=d&&d.goal&&state.items.get(d.goal);return g&&g.kind==="goal"?g:null;}
var GOAL_ICON='<svg class="goali" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/></svg>';
var LATE_BTN='<button type="button" class="btn ghost small latebtn" data-act="late-today">Tout reporter à aujourd\'hui</button>';
/* tâches qui se répètent : rep = "day" | "wdays" (lundi-vendredi) | "week" | "month" */
var REPS=[["","Non"],["day","Chaque jour"],["wdays","Du lun. au ven."],["week","Chaque semaine"],["month","Chaque mois"]];
function repLabel(r){for(var i=0;i<REPS.length;i++)if(REPS[i][0]===r)return REPS[i][1];return "";}
function stepRep(d,rep,anchor){
  var p=parse(d);
  if(rep==="day")p.setDate(p.getDate()+1);
  else if(rep==="week")p.setDate(p.getDate()+7);
  else if(rep==="wdays"){do{p.setDate(p.getDate()+1);}while(p.getDay()===0||p.getDay()===6);}
  else if(rep==="month"){var day=anchor||p.getDate();p.setDate(1);p.setMonth(p.getMonth()+1);var last=new Date(p.getFullYear(),p.getMonth()+1,0).getDate();p.setDate(Math.min(day,last));}
  else p.setDate(p.getDate()+1);
  return iso(p);
}
// prochaine échéance : au moins une fois après la date prévue, et toujours après aujourd'hui
function nextDue(d,rep,anchor){var t=today(),n=stepRep(d,rep,anchor),g=0;while(n<=t&&g++<1500)n=stepRep(n,rep,anchor);return n;}
var REP_ICON='<svg class="repi" viewBox="0 0 24 24" aria-label="se répète" role="img"><path d="M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4v-1"/></svg>';
/* écran vide : ce que c'est, à quoi ça sert, et un bouton pour commencer */
function emptyState(title,text,label){
  return '<div class="emptyst"><b>'+esc(title)+'</b><p>'+esc(text)+'</p>'+(label?'<button type="button" class="btn small" data-act="add">'+esc(label)+'</button>':"")+'</div>';
}
var BANG='<i class="bang" aria-hidden="true">!</i>';
var GRIP='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
/* mode « Ranger » : une poignée à faire glisser (ou flèches haut et bas au clavier) */
function gripBtn(a,id,ti){
  return '<button type="button" class="grip" id="grip-'+esc(id)+'" data-act="grip" data-k="'+a.v+'" data-g="'+a.g+'" data-id="'+esc(id)+'" aria-label="Déplacer : '+esc(ti)+'" aria-describedby="arr-help-'+a.v+'">'+GRIP+'</button>';
}
function taskRow(t,hideDate,a,hideCat){
  var d=t.d,ti=cap(d.title), tl='<span class="title">'+(d.prio?BANG:"")+esc(ti)+'</span>', lab=(d.prio?"Important. ":"");
  if(a)return '<div class="row'+(d.prio?" prio":"")+'" data-rid="'+esc(t.id)+'" style="padding-left:16px"><div class="body tline" style="padding-right:8px">'+tl+taskSide(d,hideDate,hideCat)+'</div>'+
    '<span class="mvs">'+gripBtn(a,t.id,ti)+'</span></div>';
  return '<div class="row'+(d.prio?" prio":"")+(d.done?" done":"")+'">'+
    checkBtn("task",t.id,d.done,(d.done?"Marquer non fait : ":"Marquer fait : ")+ti)+
    '<button type="button" class="body tline" data-act="edit" data-id="'+esc(t.id)+'" aria-label="'+esc(lab)+'Modifier : '+esc(ti)+(goalOf(d)&&!d.done?". Fait avancer « "+esc(cap(goalOf(d).title))+" »":"")+'">'+tl+taskSide(d,hideDate,hideCat)+'</button></div>';
}
/* section repliable (Tâches) : l'état est gardé sur l'appareil */
var FOLD_KEY="closer-fold", FOLD_DEF={"jour:undated":true,"taches:later":true,"taches:done":true,"devoirs:later":true,"devoirs:done":true};
function folds(){try{return Object.assign({},FOLD_DEF,JSON.parse(localStorage.getItem(FOLD_KEY)||"{}"));}catch(e){return Object.assign({},FOLD_DEF);}}
function isFolded(k){return !!folds()[k];}
function setFold(k,on){var f=folds();f[k]=!!on;try{localStorage.setItem(FOLD_KEY,JSON.stringify(f));}catch(e){}}
function foldBlock(key,title,count,rowsHtml,cls,extra){
  var shut=isFolded(key);
  return '<section class="block fold'+(shut?" shut":"")+'"><button type="button" class="sh fh" data-act="fold" data-id="'+esc(key)+'" aria-expanded="'+!shut+'">'+
    '<h2 class="'+(cls||"")+'">'+esc(title)+'</h2><span class="n">'+count+'</span><svg class="fchev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>'+
    (shut?"":'<div class="list">'+rowsHtml+'</div>'+(extra||""))+'</section>';
}
function streakOf(d){var t=today();return (d.lastDone===t||d.lastDone===shift(t,-1))?(d.streak||0):0;}
function dailyRow(x){
  var on=x.d.lastDone===today(), s=streakOf(x.d), ti=cap(x.d.title);
  return '<div class="row'+(on?" done":"")+'">'+checkBtn("daily",x.id,on,(on?"Décocher : ":"Cocher : ")+ti,"","round")+
    '<button type="button" class="body" data-act="edit" data-id="'+esc(x.id)+'" aria-label="Modifier : '+esc(ti)+'">'+
    '<span class="title">'+esc(ti)+'</span>'+(s>1?'<span class="meta"><span class="credit">'+s+' jours de suite</span></span>':"")+'</button></div>';
}
function prioSort(a,b){
  if(!!a.d.prio!==!!b.d.prio)return a.d.prio?-1:1;
  return (a.d.created||0)-(b.d.created||0);
}
function dueCmp(a,b){
  var ad=isDate(a.d.due)?a.d.due:"9999",bd=isDate(b.d.due)?b.d.due:"9999";
  return ad===bd?0:(ad<bd?-1:1);
}
function plainSort(a,b){return dueCmp(a,b)||prioSort(a,b);}
// ordre choisi à la main : les tâches rangées passent avant celles qui ne le sont pas encore
function byOrd(f,fb){
  return function(a,b){
    var ka=a.d[f]!=null,kb=b.d[f]!=null;
    if(ka||kb){var va=ka?a.d[f]:1e5+(a.d.created||0),vb=kb?b.d[f]:1e5+(b.d.created||0);if(va!==vb)return va-vb;}
    return fb(a,b);
  };
}
var ordDSort=byOrd("ordD",prioSort), ordCSort=byOrd("ordC",plainSort);
function sortTasks(a,b){return dueCmp(a,b)||ordDSort(a,b);}
function weekStart(t){var d=parse(t);return shift(t,-((d.getDay()+6)%7));}
function weekCount(d){var ws=weekStart(today()),we=shift(ws,6);return (d.dones||[]).filter(function(x){return x>=ws&&x<=we;}).length;}
function weeklyRow(x){
  var d=x.d,n=weekCount(d),tg=d.target||1,on=(d.dones||[]).indexOf(today())>=0,ti=cap(d.title),pips="";
  for(var i=0;i<tg;i++)pips+='<i'+(i<n?' class="on"':"")+'></i>';
  return '<div class="row'+(n>=tg?" reached":"")+'">'+checkBtn("weekly",x.id,on,(on?"Annuler la séance d'aujourd'hui : ":"Séance faite aujourd'hui : ")+ti,"","round")+
    '<button type="button" class="body" data-act="edit" data-id="'+esc(x.id)+'" aria-label="Modifier : '+esc(ti)+'">'+
    '<span class="title">'+esc(ti)+'</span><span class="meta"><span class="pips" aria-hidden="true">'+pips+'</span><span'+(n>=tg?' class="credit"':"")+'>'+n+' sur '+tg+' cette semaine</span></span></button></div>';
}
function block(title,count,rowsHtml,cls){
  return '<section class="block"><div class="sh"><h2 class="'+(cls||"")+'">'+esc(title)+'</h2><span class="n">'+count+'</span></div><div class="list">'+rowsHtml+'</div></section>';
}

/* ---------- pastille sur l'icône (appli ajoutée à l'écran d'accueil) ---------- */
var badgeLast=-1;
function badgeOk(){return "setAppBadge" in navigator;}
function setBadge(n){
  if(!badgeOk()||n===badgeLast)return;badgeLast=n;
  if(badgeOff())n=0;
  try{(n?navigator.setAppBadge(n):navigator.clearAppBadge()).catch(function(){});}catch(e){}
}
