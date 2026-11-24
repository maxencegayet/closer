/* Closer · Rendu global, navigation entre onglets, actions au toucher, sons et vibration. */
"use strict";
/* ---------- rendu global ---------- */
function render(){
  var a=document.activeElement, keep=null;
  if(a&&a.id&&!a.closest(".sheet")&&((a.tagName==="INPUT"&&a.type==="text")||a.tagName==="TEXTAREA"))keep={id:a.id,v:a.value,s:a.selectionStart,e:a.selectionEnd};
  var n=$("note");n.hidden=!state.note;n.textContent=state.note;
  rollRepeats();
  renderJour();renderTaches();renderObjectifs();renderHabits();renderBrouillon();animateFills();
  var fid=focusAfter||(keep&&keep.id);focusAfter=null;
  if(fid){var el=$(fid);if(el&&el!==document.activeElement){el.focus();if(keep&&keep.id===fid){if(!el.value)el.value=keep.v;try{el.setSelectionRange(keep.s,keep.e);}catch(e){}}}}
}
function route(){
  var h=(location.hash||"").slice(1), parts=h.split("/");
  // ancien onglet Devoirs : c'est maintenant un filtre de Tâches
  if(parts[0]==="devoirs"){state.filter="Devoirs";parts=["taches"];try{history.replaceState(null,"","#taches");}catch(e){}}
  // liens des notifications : #ouvrir/<id> (un rappel : ouvre simplement le Jour) et #jour/AAAA-MM-JJ (récap du soir : demain)
  if(parts[0]==="ouvrir"){state.day=today();parts=["jour"];try{history.replaceState(null,"","#jour");}catch(e){}}
  else if(parts[0]==="jour"&&isDate(parts[1])){state.day=parts[1];parts=["jour"];try{history.replaceState(null,"","#jour");}catch(e){}}
  var v=TABS.indexOf(parts[0])>=0?parts[0]:"jour";
  state.tmenu=false;
  var want=v==="brouillon"&&parts[1]?decodeURIComponent(parts[1]):null;
  if(state.noteOpen&&state.noteOpen!==want){var was=state.noteOpen;state.noteOpen=null;leaveNote(was);}
  state.noteOpen=want&&state.items.has(want)?want:null;
  TABS.forEach(function(t){$("v-"+t).hidden=t!==v;});
  if(curView&&curView!==v&&!reduce.matches&&$("v-"+v).animate)$("v-"+v).animate([{opacity:0,transform:"translateY(6px)"},{opacity:1,transform:"none"}],{duration:180,easing:EASE});
  curView=v;
  // en-tête : le titre de l'onglet prend la place de « Closer » (une ligne de moins)
  document.body.dataset.view=v;
  var br=document.querySelector("#top .brand");
  if(br){br.textContent=v==="jour"?"Closer":{taches:"Tâches",objectifs:"Objectifs",brouillon:"Brouillon"}[v];
    if(v==="jour"){br.removeAttribute("role");br.removeAttribute("aria-level");}else{br.setAttribute("role","heading");br.setAttribute("aria-level","1");}}
  $("fab").setAttribute("aria-label",v==="brouillon"?"Nouvelle note":"Ajouter");
  render();
  document.querySelectorAll("nav.tabs a").forEach(function(a){if(a.dataset.tab===v)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");});
}

/* ---------- actions ---------- */
/* retour sensible quand on enregistre : vibration, petit son, coche animée */
function fxOff(){try{return localStorage.getItem("closer-fx-off")==="1";}catch(e){return false;}}
var actx=null;
function chime(){
  try{
    if(navigator.audioSession)navigator.audioSession.type="ambient"; /* iPhone : respecte le mode silencieux */
    var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    if(!actx)actx=new AC();if(actx.state==="suspended")actx.resume();
    var t0=actx.currentTime+0.01;
    [[1046.5,0],[1568,0.075]].forEach(function(n){
      var o=actx.createOscillator(),g=actx.createGain();
      o.type="sine";o.frequency.value=n[0];
      g.gain.setValueAtTime(0.0001,t0+n[1]);g.gain.exponentialRampToValueAtTime(0.09,t0+n[1]+0.012);g.gain.exponentialRampToValueAtTime(0.0001,t0+n[1]+0.22);
      o.connect(g);g.connect(actx.destination);o.start(t0+n[1]);o.stop(t0+n[1]+0.25);
    });
  }catch(e){}
}
function haptic(){
  try{
    if(navigator.vibrate){navigator.vibrate(14);return;}
    /* iPhone (iOS 18+) : Safari n'a pas de vibration, mais l'interrupteur système en déclenche une */
    var l=$("hap");if(l)l.click();
  }catch(e){}
}
function savedFx(id,txt){
  if(!fxOff()){haptic();chime();}
  showToast(txt,true);$("toast").classList.remove("ok");void $("toast").offsetWidth;$("toast").classList.add("ok");
  requestAnimationFrame(function(){
    var el=document.querySelector('#v-'+curView+' [data-id="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]');
    var row=el&&(el.closest(".row")||el.closest(".nrow")||el.closest(".goal")||el.closest(".hab")||el);
    if(!row)return;
    row.classList.remove("flash");void row.offsetWidth;row.classList.add("flash");
    var r=row.getBoundingClientRect();if(r.top<80||r.bottom>innerHeight-110)row.scrollIntoView({block:"center",behavior:reduce.matches?"auto":"smooth"});
  });
}
/* une tâche faite, reportée ou tout un lot de retards : chaque fois, « Annuler » pendant 6 secondes */
function shortT(s){s=cap(String(s||""));return s.length>28?s.slice(0,28)+"…":s;}
function snap(id){var d=state.items.get(id);return d?JSON.parse(JSON.stringify(d)):null;}
function taskDone(id){
  var d=get(id);if(!d||d.done)return;var before=snap(id);
  statDay("active");
  if(d.rep&&isDate(d.due)){
    // tâche qui se répète : une copie « faite » garde la trace, la tâche passe à sa prochaine date
    var cp=snap(id);delete cp.rep;delete cp.repDay;cp.done=true;cp.doneOn=today();cp.doneAt=Date.now();cp.created=Date.now();
    var cid=newId();save(cid,cp);
    d.due=nextDue(d.due,d.rep,d.repDay);save(id,d);
    lastDeleted=[{id:id,data:before},{id:cid,data:null}];
    showToast("Fait. Prochaine fois : "+fmt(d.due,{weekday:"long",day:"numeric",month:"long"}));
    return;
  }
  d.done=true;d.doneOn=today();d.doneAt=Date.now();save(id,d);
  lastDeleted={id:id,data:before};showToast("Fait : « "+shortT(d.title)+" »");
}
/* tâche répétée chaque jour (ou en semaine) oubliée : elle revient d'elle-même à aujourd'hui
   au lieu de s'empiler dans « En retard » ; les répétitions plus espacées restent en retard */
function rollRepeats(){
  if(state.mode==="loading")return;
  var t=today(),n=0,wd=t;
  while(parse(wd).getDay()===0||parse(wd).getDay()===6)wd=shift(wd,1);
  state.items.forEach(function(d,id){
    if(!d||d.kind!=="task"||d.done||!isDate(d.due)||d.due>=t||(d.rep!=="day"&&d.rep!=="wdays"))return;
    var nd=Object.assign({},d);nd.due=d.rep==="day"?t:wd;state.items.set(id,nd);n++;
  });
  if(n)persistLocal();
}
function taskTomorrow(id){
  var d=get(id);if(!d||d.done)return;var before=snap(id);
  d.due=shift(today(),1);save(id,d);
  lastDeleted={id:id,data:before};showToast("Reporté à demain : « "+shortT(d.title)+" »");
}
function lateToToday(){
  var t0=today(),undo=[];
  byKind("task").forEach(function(x){if(!x.d.done&&isDate(x.d.due)&&x.d.due<t0){undo.push({id:x.id,data:snap(x.id)});var nd=get(x.id);nd.due=t0;save(x.id,nd);}});
  if(!undo.length)return;
  lastDeleted=undo;showToast(undo.length+(undo.length>1?" tâches reportées":" tâche reportée")+" à aujourd'hui");
}
function showToast(txt,noUndo){
  $("toast").classList.remove("ok");
  $("toast-txt").textContent=txt;$("toast-undo").hidden=!!noUndo;if(noUndo)lastDeleted=null;$("toast").classList.add("open");
  clearTimeout(toastTimer);toastTimer=setTimeout(function(){$("toast").classList.remove("open");lastDeleted=null;},6000);
}
function delItem(id,d){
  lastDeleted={id:id,data:d};remove(id);
  var ti=cap(d.title||"");
  showToast(d.kind==="note"?"Note supprimée":"« "+(ti.length>40?ti.slice(0,40)+"…":ti)+" » supprimé");
}
// menu « Trier et ranger » : se ferme en touchant ailleurs ou avec Échap
document.addEventListener("click",function(ev){
  if(state.tmenu&&!ev.target.closest("#tmenu,#tsort")){state.tmenu=false;renderTaches();}
},true);
document.addEventListener("keydown",function(ev){if(ev.key==="Escape"&&state.tmenu){state.tmenu=false;renderTaches();$("tsort").focus();}});
document.addEventListener("click",function(ev){
  var b=ev.target.closest("[data-act]");if(!b)return;
  var act=b.dataset.act,id=b.dataset.id,d=id?get(id):null,t=today(),i=+b.dataset.i,dr;

  /* fiche */
  if(act==="close-sheet"){closeSheet();return;}
  if(act==="draft-clear"&&sheet){
    dropDraft();var kk=addKind();
    sheet={mode:"new",kind:kk,draft:blankDraft()};if(curView==="jour")sheet.draft.due=state.day||today();
    renderSheet();var te=$("sh-title");if(te)te.focus();return;
  }
  if(act&&act.slice(0,3)==="ac-"){acAct(act,b);return;}
  /* Brouillon */
  if(act==="note-open"){openNote(id);return;}
  if(act==="nf-next"||act==="nf-prev"){if(state.nfind)nfGo(state.nfind.i+(act==="nf-next"?1:-1),true);return;}
  if(act==="nf-edit"){var mk=ev.target.closest("mark");nfEdit(mk&&b.contains(mk)?mk:null);return;}
  if(act==="goal-fold"){var op=!goalOpen(id);setGoalOpen(id,op);renderObjectifs();
    var hb=document.querySelector('#l-goals [data-act="goal-fold"][data-id="'+id+'"]');if(hb){hb.focus({preventScroll:true});var ar=hb.closest(".goal");if(op&&ar&&!reduce.matches&&ar.querySelector(".gbody").animate)ar.querySelector(".gbody").animate([{opacity:0,transform:"translateY(-4px)"},{opacity:1,transform:"none"}],{duration:200,easing:EASE});}
    return;}
  if(act==="note-close"){closeNote();return;}
  if(act==="nfilter"){state.nfolder=b.dataset.v;render();return;}
  if(act==="nf-manage"||act==="nf-new"){openSheet({mode:"edit",kind:"nfolders",draft:blankDraft(),forNote:act==="nf-new"?state.noteOpen:null},b);setTimeout(function(){var el=$("sh-nfname");if(el)el.focus();},80);return;}
  if(act==="nf-del"&&sheet){
    var gone=b.dataset.v;setNFolders(nFolders().filter(function(c){return c!==gone;}));
    byKind("note").forEach(function(x){if(x.d.folder===gone){var nd=get(x.id);nd.folder="";put(x.id,nd);}});
    if(state.nfolder===gone)state.nfolder="Toutes";
    persistLocal();render();renderSheet();$("sheet").focus();return;
  }
  if(state.noteOpen&&(act==="note-pin"||act==="note-folder"||act==="note-del"||act==="note-task")){
    var nid=state.noteOpen,nd2=get(nid);if(!nd2)return;
    if(act==="note-pin"){nd2.pinned=!nd2.pinned;save(nid,nd2);showToast(nd2.pinned?"Note épinglée en haut du Brouillon":"Note désépinglée",true);return;}
    if(act==="note-folder"){nd2.folder=b.dataset.v;save(nid,nd2);return;}
    if(act==="note-del"){state.noteOpen=null;try{history.replaceState(null,"","#brouillon");}catch(e){}delItem(nid,nd2);return;}
    if(act==="note-task"){
      var ta=$("ne-body"),v0=ta?ta.value:"",a0=ta?ta.selectionStart:0,b0=ta?ta.selectionEnd:0,line="";
      if(b0>a0)line=(v0.slice(a0,b0).split("\n").map(function(x){return x.trim();}).filter(Boolean)[0])||"";
      else{var s0=v0.lastIndexOf("\n",a0-1)+1,e0=v0.indexOf("\n",a0);if(e0<0)e0=v0.length;line=v0.slice(s0,e0);}
      line=line.replace(/^\s*([-*•–]|\d+[.)]|\[[ xX]?\])\s*/,"").trim();
      if(!line){showToast("Place le curseur sur une ligne de la note",true);return;}
      dr=blankDraft();dr.title=cap(line).slice(0,200);
      openSheet({mode:"new",kind:"task",draft:dr,fromNote:nid},b);return;
    }
  }
  if(act==="add"){
    if(curView==="brouillon"){if(!state.noteOpen)newNote();return;}
    var kept=takeDraft();
    if(kept){openSheet({mode:"new",kind:kept.kind,draft:kept.draft,restored:true},b);return;}
    dr=blankDraft();
    var kind=addKind();
    if(curView==="jour")dr.due=state.day||t;
    if(curView==="taches"&&cats().indexOf(state.filter)>=0)dr.cat=state.filter;
    openSheet({mode:"new",kind:kind,draft:dr},b);return;
  }
  if(act==="edit"){
    if(!d)return;
    dr=blankDraft();dr.title=cap(d.title||"");
    var k=d.kind==="task"?(d.cat==="Devoir"?"hw":"task"):(d.kind==="weekly"?"daily":d.kind);
    if(d.kind==="weekly")dr.freq=d.target||1;
    if(d.kind==="daily"&&hasDays(d)){dr.freq=-1;dr.days=d.days.slice();}
    if(d.kind==="task"){dr.cat=(d.cat&&d.cat!=="Devoir")?d.cat:(cats()[0]||"Perso");dr.subject=cap(d.subject||"");dr.due=isDate(d.due)?d.due:"";dr.time=isDate(d.due)&&d.time?d.time:"";dr.rep=isDate(d.due)&&d.rep?d.rep:"";dr.prio=!!d.prio;dr.note=d.note||"";}
    if(d.kind==="daily"||d.kind==="weekly")dr.time=d.time||"";
    if(d.kind==="goal"&&isDate(d.target)){var p=parse(d.target);dr.tm=String(p.getMonth()+1);dr.ty=String(p.getFullYear());}
    dr.goal=d.goal&&state.items.has(d.goal)?d.goal:"";
    openSheet({mode:"edit",kind:k,id:id,draft:dr},b);return;
  }
  if(act==="edit-step"){
    if(!d||!d.steps||!d.steps[i])return;
    dr=blankDraft();dr.title=cap(d.steps[i].t);
    openSheet({mode:"edit",kind:"step",id:id,i:i,draft:dr},b);return;
  }
  if(sheet&&(act==="stype"||act==="scat"||act==="sdate"||act==="sfreq"||act==="sday"||act==="stime")){
    syncDraft();var v=b.dataset.v;
    if(act==="stype")sheet.kind=v;
    else if(act==="scat"){if(v==="__new")sheet.draft.newCat=true;else{sheet.draft.newCat=false;sheet.draft.cat=v;}}
    else if(act==="sfreq"){sheet.draft.freq=+v;if(+v<0&&!(sheet.draft.days||[]).length)sheet.draft.days=[1,3,5];}
    else if(act==="sday"){var dl=(sheet.draft.days||[]).slice(),di0=dl.indexOf(+v);if(di0>=0)dl.splice(di0,1);else dl.push(+v);sheet.draft.days=dl;}
    else if(act==="stime"){sheet.draft.time=sheet.draft.time===v?"":v;}
    else if(v==="other"){sheet.draft.other=true;}
    else{sheet.draft.other=false;sheet.draft.due=v;}
    renderSheet();
    if(act==="scat"&&v==="__new"){var ni=$("sh-newcat");if(ni)ni.focus();}
    else if(act==="sdate"&&v==="other"){var di=$("sh-due");if(di){di.focus();try{if(di.showPicker)di.showPicker();}catch(e){}}}
    else{var nb=$("sheet").querySelector('[data-act="'+act+'"][data-v="'+v+'"]');if(nb)nb.focus();}
    return;
  }
  if(act==="backup"){if(sheet){sheet={mode:"edit",kind:"backup",draft:blankDraft()};renderSheet();$("sheet").scrollTop=0;$("sheet").focus();}else openSheet({mode:"edit",kind:"backup",draft:blankDraft()},b);return;}
  if(act==="late-today"){lateToToday();return;}
  if(act==="recap-off"){try{localStorage.setItem(RECAP_KEY,today());}catch(e){}render();return;}
  if(act==="onb-off"){try{localStorage.setItem(ONB_KEY,"1");}catch(e){}render();return;}
  if(act==="sheet-more"){syncDraft();sheet.draft.more=true;renderSheet();var fm=$("sh-prio")||$("sh-goal");if(fm)fm.focus();return;}
  if(act==="sheet-again"&&sheet){sheet.again=true;saveSheet();if(sheet)sheet.again=false;return;}
  if(act==="nlp-off"&&sheet){syncDraft();sheet.draft.nlpOff=true;var nl=$("sh-nlp");if(nl)nl.innerHTML="";var tt=$("sh-title");if(tt)tt.focus();return;}
  if(act==="stime-clear"){syncDraft();sheet.draft.time="";renderSheet();return;}
  if(act==="set-push"){if(pushOn())pushDisable();else pushEnable();return;}
  if(act==="set-morning"){pushSetMorning(b.dataset.v);renderSheet();return;}
  if(act==="set-evening"){pushSetEvening(b.dataset.v).then(function(){if(sheet&&sheet.kind==="account"){renderSheet();var nb=$("sheet").querySelector('[data-act="set-evening"][aria-checked="true"]');if(nb)nb.focus();}});renderSheet();var eb=$("sheet").querySelector('[data-act="set-evening"][data-v="'+b.dataset.v+'"]');if(eb)eb.focus();return;}
  if(act==="set-push-test"){pushTest();return;}
  if(act==="set-badge"){
    var pm=("Notification" in window)?Notification.permission:"";
    if(pm==="denied")return;
    if(pm!=="granted"){try{localStorage.removeItem("closer-badge-off");Notification.requestPermission().then(function(){badgeLast=-1;render();if(sheet)renderSheet();});}catch(e){}return;}
    try{if(badgeOff())localStorage.removeItem("closer-badge-off");else localStorage.setItem("closer-badge-off","1");}catch(e){}
    badgeLast=-1;render();renderSheet();return;
  }
  if(act==="set-theme"){setTheme(b.dataset.v);renderSheet();var tb=$("sheet").querySelector('[data-act="set-theme"][data-v="'+b.dataset.v+'"]');if(tb)tb.focus({preventScroll:true});return;}
  if(act==="set-fx"){try{if(fxOff())localStorage.removeItem("closer-fx-off");else{localStorage.setItem("closer-fx-off","1");}}catch(e){}if(!fxOff()){haptic();chime();}renderSheet();return;}
  if(act==="set-a2hs"||act==="set-news"){var k2=act==="set-a2hs"?"a2hs":"news";setOpen[k2]=!setOpen[k2];renderSheet();return;}
  if(act==="set-cats"||act==="set-folders"){sheet={mode:"edit",kind:act==="set-cats"?"cats":"nfolders",draft:blankDraft(),back:true};renderSheet();$("sheet").scrollTop=0;$("sheet").focus();return;}
  if(act==="export"&&sheet){
    var blob=new Blob([JSON.stringify({app:"closer",version:1,exported:new Date().toISOString(),items:Array.from(state.items.entries())},null,1)],{type:"application/json"});
    var link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="closer-sauvegarde-"+t+".json";
    document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(link.href);},4000);
    try{localStorage.setItem("closer-last-export",t);}catch(e){}
    sheet.draft.msg="Sauvegarde exportée. Garde ce fichier en lieu sûr.";renderSheet();return;
  }
  if(act==="cats"){state.tmenu=false;renderTaches();openSheet({mode:"edit",kind:"cats",draft:blankDraft()},b);return;}
  if(act==="cat-del"&&sheet){setCats(cats().filter(function(c){return c!==b.dataset.v;}));renderSheet();$("sheet").focus();return;}
  if(act==="sheet-del"&&sheet){
    var s=sheet,sd=get(s.id);closeSheet();
    if(!sd)return;
    if(s.kind==="step"){if(sd.steps&&sd.steps[s.i]){sd.steps.splice(s.i,1);save(s.id,sd);}}
    else delItem(s.id,sd);
    return;
  }

  if(act==="tmenu"){state.tmenu=!state.tmenu;renderTaches();if(state.tmenu){var f1=$("tmenu").querySelector("button");if(f1)f1.focus();}return;}
  if(act==="group"){state.tmenu=false;var gp=prefs();gp.group=Object.assign({},gp.group);gp.group[b.dataset.k]=b.dataset.v;save("prefs",gp);return;}
  if(act==="arr"){state.tmenu=false;state.arr[b.dataset.k]=!state.arr[b.dataset.k];render();var ab=state.arr[b.dataset.k]?$("arr-"+b.dataset.k):$("tsort");if(ab)ab.focus({preventScroll:true});return;}
  if(act==="day"){state.day=id;render();var nd=$("week").querySelector('[data-id="'+id+'"]');if(nd)nd.focus();return;}
  if(act==="filter"){state.filter=id;state.tmenu=false;render();return;}
  if(act==="fold"){var sh0=isFolded(id),fv=b.closest("[id^='v-']"),vid=fv?fv.id:"v-"+curView;setFold(id,!sh0);
    if(vid==="v-jour")renderJour();else if(vid==="v-objectifs")renderObjectifs();else renderTaches();
    var fb=document.querySelector('#'+vid+' [data-act="fold"][data-id="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]');if(fb)fb.focus({preventScroll:true});return;}
  if(act==="toggle-done"){state.showDone[id]=!state.showDone[id];render();return;}
  if(act==="clear-done"){viewTasks(id).forEach(function(x){if(x.d.done)remove(x.id);});lastDeleted=null;return;}
  if(act==="undo"){if(lastDeleted){(Array.isArray(lastDeleted)?lastDeleted:[lastDeleted]).forEach(function(u){if(u.data)save(u.id,u.data);else remove(u.id);});lastDeleted=null;}clearTimeout(toastTimer);$("toast").classList.remove("open");return;}
  if(!d)return;
  if(act==="weekly"){var ds=(d.dones||[]).slice(),wi=ds.indexOf(t);if(wi>=0)ds.splice(wi,1);else ds.push(t);d.dones=ds.slice(-80);save(id,d);}
  else if(act==="task"){if(!d.done)taskDone(id);else{d.done=false;d.doneOn="";d.doneAt=0;save(id,d);}}
  else if(act==="daily"){
    if(d.lastDone===t){d.lastDone=d.prevDone||"";d.streak=d.prevStreak||0;}
    else{d.prevDone=d.lastDone||"";d.prevStreak=d.streak||0;d.streak=(d.lastDone===prevDue(d,t)?(d.streak||0):0)+1;d.lastDone=t;}
    var hd=histOf(d).filter(function(x){return x!==t||d.lastDone===t;});if(d.lastDone===t&&hd.indexOf(t)<0)hd.push(t);d.dones=hd.sort().slice(-120);
    save(id,d);
  }
  else if(act==="step"){if(d.steps&&d.steps[i]){d.steps[i].done=!d.steps[i].done;save(id,d);}}
  else if(act==="reach"){d.reached=!d.reached;save(id,d);}
  else if(act==="del"){delItem(id,d);}
});
document.addEventListener("submit",function(ev){
  ev.preventDefault();
  var f=ev.target;
  if(f.id==="sheet"){if(sheet){if(sheet.streak&&sheet.mode==="new"){sheet.again=true;saveSheet();if(sheet)sheet.again=false;}else saveSheet();}return;}
  if(f.classList.contains("addstep")){
    var gid=f.dataset.goal,inp=f.querySelector("input"),s=cap(inp.value.trim()),d=get(gid);if(!s||!d)return;
    inp.value="";d.steps=(d.steps||[]).concat([{t:s,done:false}]);focusAfter="step-in-"+gid;save(gid,d);
  }
});
document.addEventListener("keydown",function(ev){if(ev.key==="Escape"&&sheet)closeSheet();});
document.addEventListener("change",function(ev){
  // heure du rappel choisie : la fiche se redessine pour afficher (ou retirer) l'avertissement « notifications non activées »
  if(ev.target&&ev.target.id==="sh-time"&&sheet){syncDraft();var hadWarn=!!document.querySelector("#sheet .pushwarn");if(hadWarn!==(!!sheet.draft.time&&!pushOn()))renderSheet();return;}
  if(sheet&&ev.target&&ev.target.id==="sh-import"){
    var file=ev.target.files&&ev.target.files[0];if(!file)return;
    file.text().then(function(txt){
      var o=JSON.parse(txt),arr=Array.isArray(o)?o:(o&&o.items),n=0;
      if(!Array.isArray(arr))throw new Error("format");
      arr.forEach(function(e){
        if(Array.isArray(e)&&typeof e[0]==="string"&&e[1]&&typeof e[1]==="object"&&typeof e[1].kind==="string"){state.items.set(e[0],e[1]);n++;}
      });
      if(!n)throw new Error("vide");
      persistLocal();render();
      if(sheet){sheet.draft.msg=n+" éléments importés.";renderSheet();}
    }).catch(function(){
      if(sheet){sheet.draft.msg="Ce fichier n'est pas une sauvegarde Closer valide. Choisis un fichier exporté depuis l'app.";renderSheet();}
    });
    return;
  }
  if(sheet&&ev.target&&ev.target.id==="sh-due"){syncDraft();renderSheet();}
});
window.addEventListener("hashchange",route);
document.addEventListener("visibilitychange",function(){
  if(document.hidden)Object.keys(dirty).forEach(flushNote);else render();
});
// Closer affiché au passage de minuit : on redessine dès que la date change
setInterval(function(){if(!document.hidden&&shownToday&&today()!==shownToday)render();},30000);
document.addEventListener("input",function(ev){
  var ta=ev.target;if(!ta)return;
  if(ta.id==="nb-q"){state.nq=ta.value;renderNoteList();return;}
  if(ta.id==="sh-title"&&sheet&&$("sh-nlp")){
    var sd=sheet.draft;sd.title=ta.value;$("sh-nlp").innerHTML=nlpHTML(sd);
    // les pastilles de date suivent ce qui est compris (sans redessiner la fiche, pour garder le clavier)
    var pw=!sd.nlpOff&&parseWhen(sd.title), want=pw&&pw.rest?pw.due:null;
    $("sheet").querySelectorAll('[data-act="sdate"]').forEach(function(c){
      var v=c.dataset.v,on=want!==null?v===want:(v==="other"?!!sd.other:!sd.other&&v===sd.due);c.setAttribute("aria-pressed",String(on));
    });
    return;
  }
  if(ta.id!=="ne-title"&&ta.id!=="ne-body")return;
  var id=state.noteOpen,d=get(id);if(!d)return;
  if(ta.id==="ne-title"){if(/\n/.test(ta.value))ta.value=ta.value.replace(/\n/g," ");d.title=ta.value;}else d.text=ta.value;
  d.updated=Date.now();
  state.items.set(id,d);dirty[id]=d;persistLocal();
  ta.style.height="auto";ta.style.height=ta.scrollHeight+"px";
  var m=$("ne-meta");if(m)m.textContent=edMeta(d);
  clearTimeout(noteTimers[id]);noteTimers[id]=setTimeout(function(){flushNote(id);},700);
});
document.addEventListener("keydown",function(ev){
  // Entrée dans le titre : on passe au texte, comme dans Notion
  if(ev.target&&ev.target.id==="ne-title"&&ev.key==="Enter"){ev.preventDefault();var bd=$("ne-body");if(bd){bd.focus();bd.setSelectionRange(0,0);}}
  if(ev.key==="Escape"&&!sheet&&state.noteOpen)closeNote();
});
// garder le curseur dans la note quand on touche la barre d'outils
document.addEventListener("pointerdown",function(ev){if(ev.target.closest&&ev.target.closest(".ne-tools"))ev.preventDefault();});

/* ---------- « Ranger à la main » : glisser la poignée, ou flèches haut et bas au clavier ---------- */
// lignes déplaçables avec celle-ci : tout le groupe, ou seulement le même jour quand on trie par date
function arrSpan(k,ml,id){
  if(orderModes[k]!=="date")return [0,ml.length-1];
  var me={d:get(id)||{}},a=ml.indexOf(id),b=a;
  while(a>0&&dueCmp({d:get(ml[a-1])||{}},me)===0)a--;
  while(b<ml.length-1&&dueCmp({d:get(ml[b+1])||{}},me)===0)b++;
  return [a,b];
}
function arrMove(k,g,id,to){
  var ml=((orderGroups[k]||[])[g]||[]).slice(),from=ml.indexOf(id);if(from<0)return false;
  var sp=arrSpan(k,ml,id);to=Math.max(sp[0],Math.min(sp[1],to));if(to===from)return false;
  ml.splice(from,1);ml.splice(to,0,id);
  var mf=orderModes[k]==="date"?"ordD":"ordC";
  ml.forEach(function(tid,n){var td=get(tid);if(td&&td[mf]!==n){td[mf]=n;put(tid,td);}});
  persistLocal();render();
  return true;
}
document.addEventListener("keydown",function(ev){
  var g=ev.target.closest&&ev.target.closest(".grip");if(!g||(ev.key!=="ArrowUp"&&ev.key!=="ArrowDown"))return;
  ev.preventDefault();
  var k=g.dataset.k,gi=+g.dataset.g,id=g.dataset.id,ml=(orderGroups[k]||[])[gi]||[];
  if(arrMove(k,gi,id,ml.indexOf(id)+(ev.key==="ArrowUp"?-1:1))){var nb=$("grip-"+id);if(nb)nb.focus();}
});
(function(){
  var dg=null;   // {g, row, rows, mids, from, y0, k, gi, id, span, to}
  function clear(){if(!dg)return;dg.rows.forEach(function(r){r.style.transform="";r.style.transition="";r.classList.remove("dragging");});dg=null;document.body.classList.remove("arr-drag");}
  document.addEventListener("pointerdown",function(ev){
    var g=ev.target.closest&&ev.target.closest(".grip");if(!g||dg||(ev.pointerType==="mouse"&&ev.button!==0))return;
    var row=g.closest(".row"),list=row&&row.parentElement;if(!list)return;
    var rows=Array.prototype.slice.call(list.querySelectorAll(":scope > .row")), k=g.dataset.k, gi=+g.dataset.g, id=g.dataset.id;
    var ml=(orderGroups[k]||[])[gi]||[], from=rows.indexOf(row);if(from<0||ml.length!==rows.length)return;
    ev.preventDefault();
    try{g.setPointerCapture(ev.pointerId);}catch(e){}
    dg={g:g,row:row,rows:rows,from:from,to:from,y0:ev.clientY,k:k,gi:gi,id:id,span:arrSpan(k,ml,id),h:row.offsetHeight+(rows[1]?rows[1].offsetTop-rows[0].offsetTop-rows[0].offsetHeight:0),
        mids:rows.map(function(r){return r.offsetTop+r.offsetHeight/2;})};
    row.classList.add("dragging");document.body.classList.add("arr-drag");
    rows.forEach(function(r){if(r!==row)r.style.transition="transform 160ms var(--ease-out)";});
    try{haptic();}catch(e){}
  });
  document.addEventListener("pointermove",function(ev){
    if(!dg)return;
    var dy=ev.clientY-dg.y0, c=dg.mids[dg.from]+dy, to=dg.from;
    dg.row.style.transform="translateY("+dy+"px)";
    for(var i=dg.span[0];i<=dg.span[1];i++){if(i<dg.from&&c<dg.mids[i]){to=i;break;}}
    for(var j=dg.span[1];j>=dg.span[0];j--){if(j>dg.from&&c>dg.mids[j]){to=j;break;}}
    if(to!==dg.to){dg.to=to;try{haptic();}catch(e){}}
    dg.rows.forEach(function(r,i){
      if(r===dg.row)return;
      var off=(dg.from<to&&i>dg.from&&i<=to)?-dg.h:(dg.from>to&&i>=to&&i<dg.from)?dg.h:0;
      r.style.transform=off?"translateY("+off+"px)":"";
    });
  });
  function end(){
    if(!dg)return;var d=dg;clear();
    if(d.to!==d.from&&arrMove(d.k,d.gi,d.id,d.to)){var nb=$("grip-"+d.id);if(nb)nb.focus({preventScroll:true});}
  }
  document.addEventListener("pointerup",end);
  document.addEventListener("pointercancel",clear);
})();

/* ---------- démarrage ---------- */
function localMode(note){
  state.mode="local";
  try{var raw=localStorage.getItem(LS_KEY);if(raw)state.items=new Map(JSON.parse(raw));}catch(e){}
  state.note=note||"";
  render();
  acStart();
}
