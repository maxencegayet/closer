/* Closer · Brouillon : liste façon Notes, recherche surlignée, éditeur plein écran. */
"use strict";
/* ---------- Brouillon : liste façon Notes, éditeur façon Notion ---------- */
var PIN='<svg class="pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/></svg>';
function norm(x){return String(x||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");}
function nFolders(){var p=state.items.get("prefs");return p&&Array.isArray(p.nfolders)?p.nfolders.slice():[];}
function setNFolders(l){var p=prefs();p.nfolders=l;save("prefs",p);}
function cleanFolder(v){var c=cap(String(v||"").trim()).slice(0,24);return (!c||c==="Toutes")?"":c;}
function nLines(d){return String(d.text||"").split("\n").map(function(x){return x.trim();}).filter(Boolean);}
function noteTitle(d){var t=String(d.title||"").trim();if(t)return t;return nLines(d)[0]||"Nouvelle note";}
function notePreview(d){var l=nLines(d);if(!String(d.title||"").trim())l=l.slice(1);return l.map(function(x){return x.replace(/^([-*•–]|\d+[.)]|\[[ xX]?\])\s*/,"");}).filter(Boolean).join(" ").slice(0,160);}
function noteTs(d){return d.updated||d.created||0;}
function hhmm(ts){return new Date(ts).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});}
function noteWhen(ts){
  var day=iso(new Date(ts)),n=diffDays(today(),day);
  if(n===0)return hhmm(ts);if(n===1)return "Hier";if(n<7)return cap(new Date(ts).toLocaleDateString("fr-FR",{weekday:"long"}));
  return new Date(ts).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
}
function noteGroup(ts){
  var day=iso(new Date(ts)),n=diffDays(today(),day);
  if(n<=0)return "Aujourd'hui";if(n===1)return "Hier";if(n<7)return "7 derniers jours";if(n<30)return "30 derniers jours";
  return cap(new Date(ts).toLocaleDateString("fr-FR",{month:"long",year:"numeric"}));
}
/* recherche : surlignage sans tenir compte des accents ni des majuscules */
function hlRanges(text,q){
  text=String(text||"");q=norm(q);if(!q)return [];
  var nt="",map=[],i,j,c;
  for(i=0;i<text.length;i++){c=norm(text[i]);for(j=0;j<c.length;j++){nt+=c[j];map.push(i);}}
  var r=[],p=nt.indexOf(q);
  while(p>=0){r.push([map[p],map[p+q.length-1]+1]);p=nt.indexOf(q,p+q.length);}
  return r;
}
function hlHtml(text,q,field){
  text=String(text||"");var r=hlRanges(text,q),h="",at=0;
  r.forEach(function(x){h+=esc(text.slice(at,x[0]))+'<mark'+(field?' data-f="'+field+'" data-p="'+x[0]+'" data-e="'+x[1]+'"':"")+'>'+esc(text.slice(x[0],x[1]))+'</mark>';at=x[1];});
  return h+esc(text.slice(at));
}
// aperçu centré sur le premier passage trouvé
function hlSnippet(d,q){
  var t=String(d.text||"").replace(/\s+/g," ").trim(),r=hlRanges(t,q);
  if(!r.length)return null;
  var a=Math.max(0,r[0][0]-36);if(a>0){var sp=t.lastIndexOf(" ",r[0][0]-1);if(sp>=a-12)a=sp+1;}
  var part=t.slice(a,a+170);
  return (a>0?"… ":"")+hlHtml(part,q);
}
function noteRow(x,showFolder,q){
  var d=x.d,pv=notePreview(d),sn=q?hlSnippet(d,q):null;
  return '<button type="button" class="nrow" data-act="note-open" data-id="'+esc(x.id)+'">'+
    '<span class="nt">'+(d.pinned?PIN:"")+'<span>'+(q?hlHtml(noteTitle(d),q):esc(noteTitle(d)))+'</span></span>'+
    '<span class="np'+(sn?" hit":"")+'"><b>'+esc(noteWhen(noteTs(d)))+'</b>'+(sn||esc(pv||"Pas de texte"))+'</span>'+
    (showFolder&&d.folder?'<span class="nf">'+esc(d.folder)+'</span>':"")+'</button>';
}
function renderNoteList(){
  var all=byKind("note"), q=norm(state.nq.trim());
  var notes=all.filter(function(x){return state.nfolder==="Toutes"||(x.d.folder||"")===state.nfolder;});
  if(q)notes=notes.filter(function(x){return norm((x.d.title||"")+"\n"+(x.d.text||"")+"\n"+(x.d.folder||"")).indexOf(q)>=0;});
  notes.sort(function(a,b){return noteTs(b.d)-noteTs(a.d);});
  $("nb-count").textContent=all.length?all.length+(all.length>1?" notes":" note"):"";
  if(state.mode==="loading"){$("l-notes").innerHTML='<div class="list"><div class="empty">Chargement…</div></div>';return;}
  if(!notes.length){
    $("l-notes").innerHTML='<div class="list"><div class="empty">'+(q?"Aucune note ne contient « "+esc(state.nq.trim())+" ».":state.nfolder!=="Toutes"?"Ce dossier est vide. Touche + pour y écrire une note.":"")+'</div></div>';
    if(!q&&state.nfolder==="Toutes")$("l-notes").innerHTML=emptyState("Ton brouillon est vide","Cours, idées, listes : écris ce que tu veux, c'est enregistré tout seul. Une ligne peut ensuite devenir une tâche.","Écrire une note");
    return;
  }
  if(q){$("l-notes").innerHTML=block("Résultats",notes.length,notes.map(function(x){return noteRow(x,true,state.nq.trim());}).join(""));return;}
  var h="", pins=notes.filter(function(x){return x.d.pinned;}), rest=notes.filter(function(x){return !x.d.pinned;});
  if(pins.length)h+=block("Épinglées",pins.length,pins.map(function(x){return noteRow(x,state.nfolder==="Toutes");}).join(""));
  var groups=[],by={};
  rest.forEach(function(x){var g=noteGroup(noteTs(x.d));if(!by[g]){by[g]=[];groups.push(g);}by[g].push(x);});
  groups.forEach(function(g){h+=block(g,by[g].length,by[g].map(function(x){return noteRow(x,state.nfolder==="Toutes");}).join(""));});
  $("l-notes").innerHTML=h;
}
function folderChips(){
  var fl=nFolders();
  if(state.nfolder!=="Toutes"&&fl.indexOf(state.nfolder)<0)state.nfolder="Toutes";
  return (fl.length?["Toutes"].concat(fl).map(function(c){
    return '<button type="button" class="chip" aria-pressed="'+(state.nfolder===c)+'" data-act="nfilter" data-v="'+esc(c)+'">'+esc(c)+'</button>';
  }).join(""):"")+'<button type="button" class="chip quiet" data-act="nf-manage">'+(fl.length?"Gérer":"Créer un dossier")+'</button>';
}
function autosize(){["ne-title","ne-body"].forEach(function(k){var ta=$(k);if(ta){ta.style.height="auto";if(ta.scrollHeight)ta.style.height=ta.scrollHeight+"px";}});}
function edMeta(d){var ts=noteTs(d);return ts?"Modifié "+(diffDays(today(),iso(new Date(ts)))===0?"aujourd'hui":"le "+new Date(ts).toLocaleDateString("fr-FR",{day:"numeric",month:"long"}))+" à "+hhmm(ts):"";}
function edFolders(d){
  var fl=nFolders(),cur=d.folder||"";
  if(cur&&fl.indexOf(cur)<0)fl.push(cur);
  return ['<button type="button" class="chip" aria-pressed="'+(!cur)+'" data-act="note-folder" data-v="">Sans dossier</button>'].concat(fl.map(function(c){
    return '<button type="button" class="chip" aria-pressed="'+(cur===c)+'" data-act="note-folder" data-v="'+esc(c)+'">'+esc(c)+'</button>';
  })).join("")+'<button type="button" class="chip quiet" data-act="nf-new">Nouveau dossier</button>';
}
function renderEditor(){
  var id=state.noteOpen,d=state.items.get(id),ed=$("nb-ed");
  document.body.classList.add("editing");$("nb-list").hidden=true;ed.hidden=false;
  if(ed.dataset.id===id&&$("ne-body")){
    // déjà affiché : on ne touche pas au champ en cours de frappe
    var a=document.activeElement;
    if(a!==$("ne-title")&&$("ne-title").value!==(d.title||""))$("ne-title").value=d.title||"";
    if(a!==$("ne-body")&&$("ne-body").value!==(d.text||""))$("ne-body").value=d.text||"";
    $("ne-pin").setAttribute("aria-pressed",String(!!d.pinned));$("ne-pin").setAttribute("aria-label",d.pinned?"Désépingler":"Épingler");
    $("ne-folders").innerHTML=edFolders(d);$("ne-meta").textContent=edMeta(d);autosize();return;
  }
  var fresh=ed.dataset.id!==id;ed.dataset.id=id;
  var F=state.nfind;
  if(F){
    // lecture avec les passages surlignés ; toucher le texte repasse en écriture
    ed.innerHTML='<div class="ne-top"><button type="button" class="back" data-act="note-close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Brouillon</button><span class="sp"></span></div>'+
      '<div class="nfind" role="search" aria-label="Recherche dans la note"><span class="nfq">'+esc(F.q)+'</span><span class="nfc" id="nf-count" aria-live="polite"></span>'+
      '<button type="button" class="icon" data-act="nf-prev" aria-label="Passage précédent"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>'+
      '<button type="button" class="icon" data-act="nf-next" aria-label="Passage suivant"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>'+
      '<button type="button" class="nfdone" data-act="nf-edit">Écrire</button></div>'+
      '<div class="ne'+(fresh&&!reduce.matches?" enter":"")+'">'+
      '<div class="ne-title ro" data-act="nf-edit" data-f="ne-title">'+(hlHtml(d.title||"",F.q,"ne-title")||'<span class="ph">Sans titre</span>')+'</div>'+
      '<div class="ne-meta" id="ne-meta">'+esc(edMeta(d))+'</div>'+
      '<div class="ne-body ro" data-act="nf-edit" data-f="ne-body">'+hlHtml(d.text||"",F.q,"ne-body")+'</div></div>';
    nfGo(F.i,false);return;
  }
  ed.innerHTML='<div class="ne-top"><button type="button" class="back" data-act="note-close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Brouillon</button><span class="sp"></span>'+
    '<button type="button" class="icon" id="ne-pin" data-act="note-pin" aria-pressed="'+(!!d.pinned)+'" aria-label="'+(d.pinned?"Désépingler":"Épingler")+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/></svg></button>'+
    '<button type="button" class="icon" data-act="note-del" aria-label="Supprimer la note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div>'+
    '<div class="ne'+(reduce.matches?"":" enter")+'">'+
    '<div class="chips scroll ne-folders" id="ne-folders" role="group" aria-label="Dossier de la note">'+edFolders(d)+'</div>'+
    '<textarea id="ne-title" class="ne-title" rows="1" placeholder="Sans titre" maxlength="200" aria-label="Titre de la note" autocapitalize="sentences" enterkeyhint="next">'+esc(d.title||"")+'</textarea>'+
    '<div class="ne-meta" id="ne-meta">'+esc(edMeta(d))+'</div>'+
    '<textarea id="ne-body" class="ne-body" placeholder="Écris ici…" maxlength="20000" aria-label="Texte de la note" autocapitalize="sentences">'+esc(d.text||"")+'</textarea></div>'+
    '<div class="ne-tools" id="ne-tools"><button type="button" data-act="note-task"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>Faire de la ligne une tâche</button></div>';
  autosize();placeTools();
}
function nfMarks(){return Array.prototype.slice.call(document.querySelectorAll("#nb-ed mark"));}
function nfGo(i,smooth){
  var m=nfMarks(),F=state.nfind;if(!F)return;
  if(!m.length){$("nf-count").textContent="Aucun passage";return;}
  i=(i+m.length)%m.length;F.i=i;
  m.forEach(function(x,k){x.classList.toggle("cur",k===i);});
  $("nf-count").textContent=(i+1)+" sur "+m.length;
  requestAnimationFrame(function(){var r=m[i].getBoundingClientRect();
    if(r.top<130||r.bottom>innerHeight-120)window.scrollTo({top:window.scrollY+r.top-innerHeight*0.38,behavior:smooth&&!reduce.matches?"smooth":"auto"});});
}
function nfEdit(mark){
  var m=mark||nfMarks()[state.nfind?state.nfind.i:0],f=m?m.dataset.f:"",a=m?+m.dataset.p:0,b=m?+m.dataset.e:0;
  state.nfind=null;$("nb-ed").dataset.id="";var y=window.scrollY;renderEditor();window.scrollTo(0,y);
  var el=f?$(f):null;if(el){el.focus({preventScroll:true});try{el.setSelectionRange(a,b);}catch(e){}}
}
function renderBrouillon(){
  if(state.noteOpen&&!state.items.has(state.noteOpen)){state.noteOpen=null;try{history.replaceState(null,"","#brouillon");}catch(e){}}
  if(state.noteOpen&&curView==="brouillon"){renderEditor();return;}
  document.body.classList.remove("editing");$("nb-ed").hidden=true;$("nb-ed").dataset.id="";$("nb-ed").innerHTML="";$("nb-list").hidden=false;
  $("nb-folders").innerHTML=folderChips();
  if($("nb-q").value!==state.nq&&document.activeElement!==$("nb-q"))$("nb-q").value=state.nq;
  renderNoteList();
}
function flushNote(id){
  clearTimeout(noteTimers[id]);
  delete dirty[id];
}
function leaveNote(id){
  // une note laissée vide ne reste pas dans le cahier
  var d=state.items.get(id);if(!d)return;
  if(!String(d.title||"").trim()&&!String(d.text||"").trim())remove(id);else flushNote(id);
}
function openNote(id,focus){
  var d=get(id);if(!d)return;
  // anciennes notes sans titre : la première ligne devient le titre
  if(d.title===undefined){var l=String(d.text||"").split("\n"),f=(l[0]||"").trim();if(f&&f.length<=80){d.title=f;d.text=l.slice(1).join("\n").replace(/^\n+/,"");}else d.title="";put(id,d);persistLocal();}
  if(state.noteOpen&&state.noteOpen!==id)leaveNote(state.noteOpen);
  state.noteOpen=id;
  var fq=state.nq.trim();
  state.nfind=!focus&&fq&&hlRanges((d.title||"")+"\n"+(d.text||""),fq).length?{q:fq,i:0}:null;
  try{history.pushState(null,"","#brouillon/"+encodeURIComponent(id));}catch(e){}
  render();window.scrollTo(0,0);
  if(focus){var el=$(focus);if(el)el.focus();}
}
function closeNote(){
  var id=state.noteOpen;if(!id)return;
  state.noteOpen=null;state.nfind=null;leaveNote(id);
  try{history.replaceState(null,"","#brouillon");}catch(e){}
  render();
}
function newNote(){
  var nid=newId(),now=Date.now();
  save(nid,{kind:"note",title:"",text:"",folder:state.nfolder!=="Toutes"?state.nfolder:"",pinned:false,created:now,updated:now});
  openNote(nid,"ne-title");
}
// la barre « Faire de la ligne une tâche » reste au-dessus du clavier
function placeTools(){
  var el=$("ne-tools"),vv=window.visualViewport;if(!el)return;
  var kb=vv?Math.max(0,window.innerHeight-vv.height-vv.offsetTop):0;
  el.style.transform=kb>40?"translateY("+(-kb)+"px)":"";
}
if(window.visualViewport){visualViewport.addEventListener("resize",placeTools);visualViewport.addEventListener("scroll",placeTools);}
