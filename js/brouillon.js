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
// photos et fichiers d'une note (comptés dans sa mise en forme)
function noteAtt(d){
  var h=String(d.html||""),p=(h.match(/<img [^>]*class="nimg"/g)||[]).length,f=(h.match(/<a [^>]*class="natt"/g)||[]).length;
  return {p:p,f:f,n:p+f,label:[p?p+(p>1?" photos":" photo"):"",f?f+(f>1?" fichiers":" fichier"):""].filter(Boolean).join(", ")};
}
function noteRow(x,showFolder,q){
  var d=x.d,pv=notePreview(d)||noteAtt(d).label,sn=q?hlSnippet(d,q):null;
  // la ligne : toucher = ouvrir ; glisser vers la gauche = supprimer (iPhone) ; « Faire le tri » = cocher (ordinateur)
  var T=state.ntri, on=!!(T&&T[x.id]);
  return '<div class="nwrap'+(T?" picking":"")+'"><button type="button" class="nrow" data-act="'+(T?"ntri-pick":"note-open")+'" data-id="'+esc(x.id)+'"'+(T?' role="checkbox" aria-checked="'+on+'"':"")+'>'+
    (T?'<span class="npick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 12.5l3.2 3.2L17 9"/></svg></span>':"")+
    '<span class="nt">'+(d.pinned?PIN:"")+'<span>'+(q?hlHtml(noteTitle(d),q):esc(noteTitle(d)))+'</span></span>'+
    '<span class="np'+(sn?" hit":"")+'"><b>'+esc(noteWhen(noteTs(d)))+'</b>'+(sn||esc(pv||"Pas de texte"))+'</span>'+
    (showFolder&&d.folder?'<span class="nf">'+esc(d.folder)+'</span>':"")+'</button></div>';
}
function renderNoteList(){
  var all=byKind("note"), q=norm(state.nq.trim());
  var notes=all.filter(function(x){return state.nfolder==="Toutes"||(x.d.folder||"")===state.nfolder;});
  if(q)notes=notes.filter(function(x){return norm((x.d.title||"")+"\n"+(x.d.text||"")+"\n"+(x.d.folder||"")).indexOf(q)>=0;});
  notes.sort(function(a,b){return noteTs(b.d)-noteTs(a.d);});
  $("nb-count").textContent=all.length?all.length+(all.length>1?" notes":" note"):"";
  // « Faire le tri » (ordinateur) : cocher des notes puis les supprimer d'un coup, avec « Annuler »
  if(state.ntri)Object.keys(state.ntri).forEach(function(k){if(!state.items.has(k))delete state.ntri[k];});
  var tb=$("nb-tri");if(tb){tb.hidden=!all.length&&!state.ntri;tb.textContent=state.ntri?"Terminé":"Faire le tri";tb.setAttribute("aria-pressed",String(!!state.ntri));}
  renderTriBar(notes);
  if(state.mode==="loading"){$("l-notes").innerHTML='<div class="list"><div class="empty">Chargement…</div></div>';return;}
  if(!notes.length){
    $("l-notes").innerHTML='<div class="list"><div class="empty">'+(q?"Aucune note ne contient « "+esc(state.nq.trim())+" ».":state.nfolder!=="Toutes"?"Ce dossier est vide. Touche + pour y écrire une note.":"")+'</div></div>';
    if(!q&&state.nfolder==="Toutes")$("l-notes").innerHTML=emptyState("Ton brouillon est vide","Cours, idées, listes : écris ce que tu veux, c'est enregistré tout seul.","Écrire une note");
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
function autosize(){["ne-title","ne-body"].forEach(function(k){var ta=$(k);if(ta&&ta.tagName==="TEXTAREA"){ta.style.height="auto";if(ta.scrollHeight)ta.style.height=ta.scrollHeight+"px";}});}
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
    if(a!==$("ne-body")){var want=noteHtml(d);if(rteClean($("ne-body").innerHTML)!==want){$("ne-body").innerHTML=want;phHydrate($("ne-body"));}}
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
    '<div id="ne-body" class="ne-body rte" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Texte de la note" data-ph="Écris ici…" autocapitalize="sentences" spellcheck="true">'+noteHtml(d)+'</div></div>'+
    '<div class="ne-tools compact" id="ne-tools">'+fmtBar()+'</div>';
  autosize();placeTools();phHydrate($("ne-body"));
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
  var el=f?$(f):null;if(el){el.focus({preventScroll:true});if(el.isContentEditable)rteSelect(el,a,b);else try{el.setSelectionRange(a,b);}catch(e){}}
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
  if(!String(d.title||"").trim()&&!String(d.text||"").trim()&&!noteAtt(d).n)remove(id);else flushNote(id);
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
// barre à la Notion (25 nov.) : collée au-dessus du clavier tant qu'on écrit dans la note
var IS_IOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
function placeTools(){
  var el=$("ne-tools"),vv=window.visualViewport;if(!el)return;
  var kb=vv?Math.max(0,window.innerHeight-vv.height-vv.offsetTop):0, open=kb>40||(vv&&window.innerHeight-vv.height>40);
  el.classList.toggle("kb",!!open);
  if(!open||!vv){el.style.transform="";return;}
  // on part du bas de la zone visible (visualViewport), pas de innerHeight ; sur iPhone, la barre d'iOS
  // au-dessus du clavier (flèches et ✓, iOS 26) flotte dans cette zone sans y être comptée : on la laisse dessous
  var h=el.offsetHeight||52, y=vv.offsetTop+vv.height-h-(IS_IOS?66:10);
  el.style.transform="translateY("+Math.round(y)+"px)";
}
if(window.visualViewport){visualViewport.addEventListener("resize",placeTools);visualViewport.addEventListener("scroll",placeTools);}

/* ---------- texte enrichi (25 nov.) : gras, italique, souligné, barré, surligné en 5 couleurs ----------
   d.text reste le texte brut (recherche, aperçu, « Faire de la ligne une tâche », anciennes versions de Closer).
   d.html garde la mise en forme, d.hk = empreinte du texte au moment où html a été enregistré :
   si une ancienne version de Closer modifie le texte sur un autre appareil, html est périmé et on repart du texte. */
var HL=[["y","#fff0a3","Jaune"],["g","#c8f1c5","Vert"],["b","#cde2ff","Bleu"],["p","#ffd1e1","Rose"],["o","#ffd9b0","Orange"]];
function hlHex(k){for(var i=0;i<HL.length;i++)if(HL[i][0]===k)return HL[i][1];return "";}
function rgbOf(c){
  c=String(c||"").trim().toLowerCase();var m;
  if((m=/^#([0-9a-f]{6})$/.exec(c)))return [parseInt(m[1].slice(0,2),16),parseInt(m[1].slice(2,4),16),parseInt(m[1].slice(4),16),1];
  if((m=/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(c)))return [+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]];
  return null;
}
// couleur de surlignage → clé de la palette (une couleur inconnue ou transparente = pas de surlignage)
function hlKey(c){
  var v=rgbOf(c);if(!v||v[3]<0.5)return "";
  var best="",bd=1e9;HL.forEach(function(h){var w=rgbOf(h[1]),d=Math.abs(w[0]-v[0])+Math.abs(w[1]-v[1])+Math.abs(w[2]-v[2]);if(d<bd){bd=d;best=h[0];}});
  return bd<=60?best:"";
}
function rteBlock(n){return n&&n.nodeType===1&&/^(DIV|P|LI|H[1-6]|BLOCKQUOTE|UL|OL|PRE)$/.test(n.tagName);}
// texte brut d'un éditeur : une ligne par bloc ou par <br>, comme le textarea d'avant ; map = nœuds de texte et leur position
function rteText(root,map){
  var out="",start=true,blockEnd=false;
  function nl(be){out+="\n";start=true;blockEnd=!!be;}
  function rec(n){
    for(var c=n.firstChild;c;c=c.nextSibling){
      if(c.nodeType===3){var t=c.data.replace(/ /g," ").replace(/​/g,"");if(map)map.push([out.length,c]);if(t){out+=t;start=false;blockEnd=false;}}
      else if(c.nodeType===1){
        if(c.tagName==="IMG"){start=false;blockEnd=false;continue;}
        if(c.tagName==="A"&&c.classList.contains("natt")){var nm=c.getAttribute("data-n")||"";out+=nm;start=false;blockEnd=false;continue;}
        if(c.tagName==="BR"){if(c===n.lastChild&&(n===root||rteBlock(n))&&!start)continue;nl(false);}   // <br> de fin de ligne : invisible
        else if(rteBlock(c)){if(!start)nl(false);var b0=out.length;rec(c);if(!start||out.length===b0)nl(true);}
        else rec(c);
      }
    }
  }
  rec(root);
  if(blockEnd&&out.charAt(out.length-1)==="\n")out=out.slice(0,-1);
  return out;
}
function rteFromText(t){
  t=String(t||"");if(!t)return "";
  return t.split("\n").map(function(l){return "<div>"+(l?esc(l):"<br>")+"</div>";}).join("");
}
// nettoyage : on ne garde que le texte, les lignes et les 5 mises en forme
function rteClean(html){
  var tpl=document.createElement("template");tpl.innerHTML=String(html||"");
  var out=document.createElement("div");
  function add(parent,node){
    for(var c=node.firstChild;c;c=c.nextSibling){
      if(c.nodeType===3){parent.appendChild(document.createTextNode(c.data));continue;}
      if(c.nodeType!==1)continue;
      var tag=c.tagName;
      if(tag==="BR"){parent.appendChild(document.createElement("br"));continue;}
      // photo ou fichier joint : seulement son identifiant (le contenu est rangé à part, voir « pièces jointes »)
      if((tag==="IMG"||(tag==="A"&&c.classList.contains("natt")))&&/^[a-z0-9]{6,40}$/i.test(c.getAttribute("data-p")||"")){
        var at=document.createElement(tag==="IMG"?"img":"a");at.setAttribute("data-p",c.getAttribute("data-p"));
        if(tag==="IMG"){at.className="nimg";at.setAttribute("alt","");}
        else{at.className="natt";at.setAttribute("data-n",String(c.getAttribute("data-n")||"Fichier").slice(0,120));at.setAttribute("data-s",String(+c.getAttribute("data-s")||0));at.setAttribute("contenteditable","false");at.textContent=at.getAttribute("data-n");}
        parent.appendChild(at);continue;
      }
      if(/^(SCRIPT|STYLE|TEMPLATE|IFRAME|OBJECT|EMBED|IMG|SVG|VIDEO|AUDIO|CANVAS|INPUT|BUTTON|SELECT|TEXTAREA|META|LINK|HEAD|TITLE)$/.test(tag))continue;
      var target=parent,st=c.style||{},td=String(st.textDecorationLine||st.textDecoration||""),fw=String(st.fontWeight||"");
      if(rteBlock(c)){var dv=document.createElement("div");parent.appendChild(dv);target=dv;}
      var f=[];
      if(tag==="B"||tag==="STRONG"||fw==="bold"||+fw>=600)f.push("b");
      if(tag==="I"||tag==="EM"||st.fontStyle==="italic")f.push("i");
      if(tag==="U"||/underline/.test(td))f.push("u");
      if(tag==="S"||tag==="STRIKE"||tag==="DEL"||/line-through/.test(td))f.push("s");
      f.forEach(function(t){var e=document.createElement(t);target.appendChild(e);target=e;});
      var k=hlKey(st.backgroundColor);
      if(k){var sp=document.createElement("span");sp.style.backgroundColor=hlHex(k);target.appendChild(sp);target=sp;}
      add(target,c);
    }
  }
  add(out,tpl.content);
  // mises en forme vides : retirées
  Array.prototype.slice.call(out.querySelectorAll("b,i,u,s,span")).reverse().forEach(function(e){if(!e.textContent&&!e.querySelector("br,img,a"))e.remove();});
  return out.innerHTML;
}
function noteHtml(d){
  var t=String(d.text||"");
  return d.html&&d.hk===hsh(t)?rteClean(d.html):rteFromText(t);
}
// curseur ↔ position dans le texte brut
function rteOffsets(root){
  var sel=window.getSelection();if(!sel||!sel.rangeCount)return [0,0];
  var r=sel.getRangeAt(0);if(!root.contains(r.startContainer))return [0,0];
  function at(node,off){var x=document.createRange();x.setStart(root,0);x.setEnd(node,off);var d=document.createElement("div");d.appendChild(x.cloneContents());return rteText(d).length;}
  return [at(r.startContainer,r.startOffset),at(r.endContainer,r.endOffset)];
}
function rteSelect(root,a,b){
  var map=[];rteText(root,map);
  function pos(o){
    for(var i=map.length-1;i>=0;i--){if(map[i][0]<=o){var n=map[i][1];return [n,Math.min(n.data.length,o-map[i][0])];}}
    return [root,0];
  }
  var p=pos(a),q=pos(b),r=document.createRange();
  try{r.setStart(p[0],p[1]);r.setEnd(q[0],q[1]);var s=window.getSelection();s.removeAllRanges();s.addRange(r);}catch(e){}
}
// enregistre le contenu de l'éditeur dans la note
function rteSave(el){
  var id=state.noteOpen,d=get(id);if(!d||!el)return;
  var t=rteText(el);
  if(t.length>20000){showToast("Note trop longue : 20 000 caractères au plus",true);}
  d.text=t;d.html=rteClean(el.innerHTML);d.hk=hsh(t);
  if(!t.trim()&&!/<(img|a) /.test(d.html)){delete d.html;delete d.hk;}   // une note avec seulement des photos garde sa mise en forme
  d.updated=Date.now();
  state.items.set(id,d);dirty[id]=d;persistLocal();
  var m=$("ne-meta");if(m)m.textContent=edMeta(d);
  clearTimeout(noteTimers[id]);noteTimers[id]=setTimeout(function(){flushNote(id);},700);
}
// mise en forme : boutons de la barre et raccourcis clavier
function rteBody(){var el=$("ne-body");return el&&el.isContentEditable?el:null;}
function rteFocus(){
  var el=rteBody();if(!el)return null;
  var s=window.getSelection();
  if(!s.rangeCount||!el.contains(s.anchorNode)){el.focus();var r=document.createRange();r.selectNodeContents(el);r.collapse(false);s.removeAllRanges();s.addRange(r);}
  return el;
}
function rteCmd(cmd){
  if(!rteFocus())return;
  try{document.execCommand("styleWithCSS",false,false);}catch(e){}
  document.execCommand(cmd,false,null);
  rteState();
}
// surlignage de la sélection (k = clé de couleur, "" = enlever)
function rteHl(k){
  var el=rteFocus();if(!el)return;
  try{document.execCommand("styleWithCSS",false,true);}catch(e){}
  document.execCommand("hiliteColor",false,k?hlHex(k):"transparent");
  try{document.execCommand("styleWithCSS",false,false);}catch(e){}
  // enlever : on retire aussi les surlignages englobants que le navigateur aurait laissés
  if(!k){var s=window.getSelection();if(s.rangeCount){var r=s.getRangeAt(0);
    Array.prototype.slice.call(el.querySelectorAll("span")).forEach(function(sp){if(hlKey(sp.style.backgroundColor)&&r.intersectsNode(sp)){var range=document.createRange();range.selectNodeContents(sp);
      if(r.compareBoundaryPoints(Range.START_TO_START,range)<=0&&r.compareBoundaryPoints(Range.END_TO_END,range)>=0)sp.style.backgroundColor="";}});}}
  rteSave(el);rteState();
}
function rteHlAt(){
  var s=window.getSelection();if(!s.rangeCount)return "";
  for(var n=s.anchorNode;n&&n.id!=="ne-body";n=n.parentNode)if(n.nodeType===1&&n.style){var k=hlKey(n.style.backgroundColor);if(k)return k;}
  return "";
}
// état des boutons (gras actif, etc.)
// la barre apparaît dès qu'on écrit dans le texte de la note (curseur dedans), comme dans Notion
var aaOpen=false;
function rteMode(){
  var tools=$("ne-tools"),body=$("ne-body");if(!tools||!body)return;
  var a=document.activeElement, show=a===body||aaOpen||(a&&tools.contains(a));
  if(tools.classList.contains("full")!==!!show){tools.classList.toggle("full",!!show);tools.classList.toggle("compact",!show);}
  var p=$("ne-aa");if(p)p.hidden=!aaOpen;
  var ab=tools.querySelector('[data-act="aa"]');if(ab)ab.setAttribute("aria-expanded",String(aaOpen));
  if(show)placeTools();
}
function rteState(){
  rteMode();
  var bar=$("ne-aa");if(!bar)return;
  ["bold","italic","underline","strikeThrough"].forEach(function(c){var b=bar.querySelector('[data-v="'+c+'"]');if(b){var on=false;try{on=document.queryCommandState(c);}catch(e){}b.setAttribute("aria-pressed",String(!!on));}});
  var k=rteHlAt();Array.prototype.forEach.call(document.querySelectorAll("#ne-aa .hlc"),function(c){c.setAttribute("aria-pressed",String(c.dataset.v===k&&!!k));});
}
document.addEventListener("selectionchange",function(){if($("ne-tools"))rteState();var b=$("ne-body"),sl=window.getSelection();if(b&&sl&&sl.rangeCount&&b.contains(sl.anchorNode))phRange=sl.getRangeAt(0).cloneRange();});
document.addEventListener("focusin",function(){if($("ne-tools"))rteMode();});
document.addEventListener("focusout",function(){setTimeout(function(){
  var t=$("ne-tools"),a=document.activeElement;if(!t)return;
  if(a!==$("ne-body")&&!(a&&t.contains(a))&&!$("ne-attsheet"))aaOpen=false;   // on a quitté la note : le panneau « Aa » se ferme
  rteMode();
},0);});
var RTE_ICON={
  bold:'<b>B</b>',italic:'<i>I</i>',underline:'<u>U</u>',strikeThrough:'<s>S</s>'
};
function fmtBar(){
  return '<div class="ne-aa" id="ne-aa" hidden role="group" aria-label="Mise en forme du texte">'+
      '<div class="aa-row">'+[["bold","Gras","⌘B"],["italic","Italique","⌘I"],["underline","Souligné","⌘U"],["strikeThrough","Barré","⌘⇧X"]].map(function(x){
        return '<button type="button" class="fb" data-act="fmt" data-v="'+x[0]+'" aria-pressed="false" aria-label="'+x[1]+'" title="'+x[1]+' ('+x[2]+')">'+RTE_ICON[x[0]]+'</button>';}).join("")+'</div>'+
      '<div class="aa-row hlrow" id="hl-pop">'+HL.map(function(h){return '<button type="button" class="hlc" data-act="hl" data-v="'+h[0]+'" style="background:'+h[1]+'" aria-label="Surligner en '+h[2].toLowerCase()+'" title="'+h[2]+'"></button>';}).join("")+
        '<button type="button" class="hlc none" data-act="hl" data-v="" aria-label="Enlever le surlignage" title="Sans surlignage"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'+
    '</div>'+
    '<div class="ne-fmt" id="ne-fmt" role="toolbar" aria-label="Outils de la note">'+
      '<button type="button" class="tb" data-act="aa" aria-expanded="false" aria-controls="ne-aa" aria-label="Mise en forme du texte" title="Mise en forme"><span class="aa-ic" aria-hidden="true">Aa</span></button>'+
      '<button type="button" class="tb" data-act="att-open" aria-haspopup="dialog" aria-label="Ajouter une photo ou un fichier" title="Ajouter une photo ou un fichier"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>'+
    '</div>';
}
// coller : texte seul (pas les styles d'une page web)
document.addEventListener("paste",function(ev){
  if(!ev.target||!ev.target.closest||!ev.target.closest("#ne-body"))return;
  var t=ev.clipboardData&&ev.clipboardData.getData("text/plain");if(t==null)return;
  ev.preventDefault();document.execCommand("insertText",false,t);
});
// raccourcis : ⌘/Ctrl B, I, U (navigateur), ⌘/Ctrl ⇧ X (barré), ⌘/Ctrl ⇧ H (surligner en jaune ou enlever)
document.addEventListener("keydown",function(ev){
  if(!ev.target||ev.target.id!=="ne-body"||!(ev.metaKey||ev.ctrlKey)||ev.altKey)return;
  var k=String(ev.key||"").toLowerCase();
  if(!ev.shiftKey&&(k==="b"||k==="i"||k==="u")){ev.preventDefault();rteCmd(k==="b"?"bold":k==="i"?"italic":"underline");return;}
  if(ev.shiftKey&&k==="x"){ev.preventDefault();rteCmd("strikeThrough");return;}
  if(ev.shiftKey&&k==="h"){ev.preventDefault();rteHl(rteHlAt()?"":"y");}
});

/* ---------- « Faire le tri » (ordinateur, 25 nov.) : remplace la corbeille au survol, trop facile à toucher par erreur ---------- */
function triIds(){return state.ntri?Object.keys(state.ntri):[];}
function renderTriBar(shown){
  var bar=$("nb-tribar");if(!bar)return;
  if(!state.ntri||state.noteOpen){bar.hidden=true;bar.innerHTML="";document.body.classList.remove("tri");return;}
  document.body.classList.add("tri");
  var n=triIds().length, allOn=shown&&shown.length&&shown.every(function(x){return state.ntri[x.id];});
  bar.hidden=false;
  bar.innerHTML='<button type="button" class="tb-all" data-act="ntri-all">'+(allOn?"Tout désélectionner":"Tout sélectionner")+'</button>'+
    '<span class="tb-n" aria-live="polite">'+(n?n+(n>1?" notes sélectionnées":" note sélectionnée"):"Clique sur les notes à supprimer")+'</span>'+
    '<button type="button" class="tb-del" data-act="ntri-del"'+(n?"":" disabled")+'>Supprimer'+(n?" ("+n+")":"")+'</button>';
}
function triDel(){
  var ids=triIds();if(!ids.length)return;
  var undo=ids.map(function(i){return {id:i,data:get(i)};}).filter(function(u){return u.data;});
  ids.forEach(function(i){remove(i);});
  state.ntri={};render();
  lastDeleted=undo;showToast(undo.length+(undo.length>1?" notes supprimées":" note supprimée"));
}
document.addEventListener("keydown",function(ev){
  if(!state.ntri||state.noteOpen||sheet||curView!=="brouillon")return;
  var t=ev.target&&ev.target.tagName;if(t==="INPUT"||t==="TEXTAREA")return;
  if(ev.key==="Escape"){state.ntri=null;render();var tb=$("nb-tri");if(tb)tb.focus();}
  else if((ev.key==="Backspace"||ev.key==="Delete")&&triIds().length){ev.preventDefault();triDel();}
});

/* ---------- photos et fichiers dans une note (25 nov.) ----------
   Le contenu est rangé sur l'appareil (IndexedDB « closer », magasin « att ») et, une fois connecté, envoyé dans
   Supabase Storage (seau privé « closer-photos », dossier = id du compte). La note ne garde que l'identifiant :
   <img class="nimg" data-p="…"> ou <a class="natt" data-p="…" data-n="nom" data-s="taille">. */
var PH_BUCKET="closer-photos", phDb=null, phUrls={}, phRange=null, PH_MAX=20*1024*1024;
function phOpen(){
  if(phDb)return phDb;
  phDb=new Promise(function(ok,ko){
    if(!window.indexedDB){ko(new Error("IndexedDB indisponible"));return;}
    var r=indexedDB.open("closer",1);
    r.onupgradeneeded=function(){r.result.createObjectStore("att");};
    r.onsuccess=function(){ok(r.result);};r.onerror=function(){ko(r.error);};
  });
  return phDb;
}
// rangé en octets (ArrayBuffer) et non en Blob : Safari refuse les Blob dans IndexedDB dans certains cas
// (navigation privée, et constaté dans les tests WebKit le 25 nov.)
function phPut(id,rec){
  return rec.blob.arrayBuffer().then(function(buf){
    return phOpen().then(function(db){return new Promise(function(ok,ko){var t=db.transaction("att","readwrite");t.objectStore("att").put({buf:buf,type:rec.type||rec.blob.type||"",name:rec.name||""},id);t.oncomplete=function(){ok();};t.onerror=function(){ko(t.error);};t.onabort=function(){ko(t.error);};});});
  });
}
function phGet(id){
  return phOpen().then(function(db){return new Promise(function(ok,ko){var q=db.transaction("att").objectStore("att").get(id);
    q.onsuccess=function(){var r=q.result;if(!r){ok(null);return;}ok({blob:r.blob||new Blob([r.buf],{type:r.type||""}),type:r.type,name:r.name});};q.onerror=function(){ko(q.error);};});});
}
function phPath(id){return SU?SU.id+"/"+id:null;}
// file d'attente des envois (survit à la fermeture de l'appli)
function phQ(){try{return JSON.parse(localStorage.getItem("closer-att-up")||"[]");}catch(e){return [];}}
function phQset(q){try{localStorage.setItem("closer-att-up",JSON.stringify(q));}catch(e){}}
var phBusy=false;
function phFlush(){
  if(phBusy||!SB||!SU||!SB.storage)return Promise.resolve();
  var q=phQ();if(!q.length)return Promise.resolve();
  phBusy=true;
  return q.reduce(function(p,id){return p.then(function(){
    return phGet(id).then(function(rec){
      if(!rec){phQset(phQ().filter(function(x){return x!==id;}));return;}
      return SB.storage.from(PH_BUCKET).upload(phPath(id),rec.blob,{upsert:true,contentType:rec.type||"application/octet-stream"}).then(function(r){
        if(r&&r.error)throw r.error;
        phQset(phQ().filter(function(x){return x!==id;}));
      });
    });
  });},Promise.resolve()).catch(function(e){logErr("photos",e);}).then(function(){phBusy=false;});
}
// contenu d'une pièce jointe : sur l'appareil, sinon téléchargé depuis le compte
function phBlob(id){
  return phGet(id).then(function(rec){
    if(rec)return rec.blob;
    if(!SB||!SU||!SB.storage)return null;
    return SB.storage.from(PH_BUCKET).download(phPath(id)).then(function(r){
      if(!r||r.error||!r.data)return null;
      return phPut(id,{blob:r.data,type:r.data.type||""}).then(function(){return r.data;});
    });
  }).catch(function(e){logErr("photos",e);return null;});
}
function phUrl(id){
  if(phUrls[id])return Promise.resolve(phUrls[id]);
  return phBlob(id).then(function(b){if(!b)return null;phUrls[id]=URL.createObjectURL(b);return phUrls[id];});
}
function phSize(n){n=+n||0;return n<1024*1024?Math.max(1,Math.round(n/1024))+" Ko":(n/1024/1024).toFixed(1).replace(".",",")+" Mo";}
// affiche les photos et pièces jointes d'un éditeur
function phHydrate(root){
  if(!root)return;
  Array.prototype.forEach.call(root.querySelectorAll("img.nimg[data-p]"),function(im){
    if(im.getAttribute("src"))return;
    im.classList.add("loading");
    phUrl(im.dataset.p).then(function(u){if(u){im.src=u;im.classList.remove("loading");}else{im.classList.add("missing");}});
  });
  Array.prototype.forEach.call(root.querySelectorAll("a.natt[data-p]"),function(a){
    a.setAttribute("contenteditable","false");a.setAttribute("role","button");a.setAttribute("href","#");
    a.textContent=a.dataset.n||"Fichier";
    var sz=document.createElement("small");sz.textContent=phSize(a.dataset.s);a.appendChild(sz);
  });
}
document.addEventListener("click",function(ev){
  var a=ev.target.closest&&ev.target.closest("#ne-body a.natt");if(!a)return;
  ev.preventDefault();
  var w=window.open("","_blank");
  phUrl(a.dataset.p).then(function(u){if(u&&w)w.location.href=u;else{if(w)w.close();showToast("Fichier introuvable sur cet appareil",true);}});
});
// photo : réduite à 1600 px de côté, en JPEG
function phShrink(file){
  return new Promise(function(ok){
    var u=URL.createObjectURL(file),im=new Image();
    im.onload=function(){
      var k=Math.min(1,1600/Math.max(im.naturalWidth,im.naturalHeight)),w=Math.round(im.naturalWidth*k),h=Math.round(im.naturalHeight*k);
      var cv=document.createElement("canvas");cv.width=w;cv.height=h;cv.getContext("2d").drawImage(im,0,0,w,h);URL.revokeObjectURL(u);
      cv.toBlob(function(b){ok(b||file);},"image/jpeg",0.82);
    };
    im.onerror=function(){URL.revokeObjectURL(u);ok(file);};
    im.src=u;
  });
}
function phInsert(node){
  var body=$("ne-body");if(!body)return;
  body.focus({preventScroll:true});
  var s=window.getSelection(),r=phRange&&body.contains(phRange.startContainer)?phRange:null;
  if(!r){r=document.createRange();r.selectNodeContents(body);r.collapse(false);}
  // dans son propre bloc, après la ligne du curseur
  var blk=r.startContainer;while(blk&&blk.parentNode!==body)blk=blk.parentNode;
  var wrap=document.createElement("div");wrap.appendChild(node);
  var after=document.createElement("div");after.appendChild(document.createElement("br"));
  if(blk&&blk!==body){body.insertBefore(wrap,blk.nextSibling);}else body.appendChild(wrap);
  body.insertBefore(after,wrap.nextSibling);
  var nr=document.createRange();nr.setStart(after,0);nr.collapse(true);s.removeAllRanges();s.addRange(nr);
  rteSave(body);phHydrate(body);
  try{wrap.scrollIntoView({block:"center",behavior:"smooth"});}catch(e){}
}
function phAdd(files,kind){
  files=Array.prototype.slice.call(files||[]);if(!files.length)return;
  files.reduce(function(p,f){return p.then(function(){
    var isImg=/^image\//.test(f.type)&&kind!=="file";
    if(!isImg&&f.size>PH_MAX){showToast("« "+shortT(f.name)+" » dépasse 20 Mo",true);return;}
    return (isImg?phShrink(f):Promise.resolve(f)).then(function(b){
      var id=newId(),type=isImg?"image/jpeg":(f.type||"application/octet-stream");
      return phPut(id,{blob:b,type:type,name:f.name}).then(function(){
        var q=phQ();q.push(id);phQset(q);
        if(isImg){var im=document.createElement("img");im.className="nimg";im.setAttribute("data-p",id);im.alt="";phInsert(im);}
        else{var a=document.createElement("a");a.className="natt";a.setAttribute("data-p",id);a.setAttribute("data-n",f.name||"Fichier");a.setAttribute("data-s",String(b.size||f.size||0));phInsert(a);}
      });
    });
  });},Promise.resolve()).then(function(){phFlush();}).catch(function(e){logErr("photos",e&&(e.name+" "+e.message)||e);showToast("Impossible d'ajouter ce fichier",true);});
}
// panneau « Ajouter » : Photos, Appareil photo, Fichiers (comme dans Notion)
function attSheet(open){
  var el=$("ne-attsheet");
  if(!open){if(el){el.classList.remove("open");setTimeout(function(){if(el&&!el.classList.contains("open"))el.remove();},220);}return;}
  if(el)el.remove();
  el=document.createElement("div");el.id="ne-attsheet";el.className="attsheet";el.setAttribute("role","dialog");el.setAttribute("aria-label","Ajouter à la note");
  var IC={photos:'<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l4.5-4.5 3 3 2.5-2.5L19.5 17"/>',
    cam:'<path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.3" r="3.3"/>',
    file:'<path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"/>'};
  function row(k,t,sub){return '<button type="button" class="attrow" data-act="att-pick" data-v="'+k+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+IC[k]+'</svg><span><b>'+t+'</b><small>'+sub+'</small></span></button>';}
  el.innerHTML='<div class="attback" data-act="att-close"></div><div class="attpanel"><span class="attgrip" aria-hidden="true"></span>'+
    row("photos","Photos","Choisis dans ta photothèque")+row("cam","Appareil photo","Prends une photo")+row("file","Fichiers","PDF, documents, présentations…")+
    '<input type="file" id="att-photos" accept="image/*" multiple hidden><input type="file" id="att-cam" accept="image/*" capture="environment" hidden><input type="file" id="att-file" multiple hidden></div>';
  document.body.appendChild(el);
  ["photos","cam","file"].forEach(function(k){$("att-"+k).addEventListener("change",function(ev){var fs=ev.target.files;attSheet(false);phAdd(fs,k==="file"?"file":"img");});});
  requestAnimationFrame(function(){el.classList.add("open");});
}
