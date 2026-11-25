/* Closer · Fiche d'ajout et de modification (tâche, devoir, habitude, objectif), brouillon de fiche. */
"use strict";
/* ---------- fiche d'ajout et de modification ---------- */
// jours choisis, rangés ; les 7 jours = chaque jour
function normDays(l){l=(l||[]).filter(function(n){return n>=1&&n<=7;}).sort();l=l.filter(function(n,i){return l.indexOf(n)===i;});return l.length===7?[]:l;}
function blankDraft(){return {title:"",cat:(cats()[0]||"Perso"),newCat:false,newCatName:"",freq:0,days:[],subject:"",due:"",time:"",rep:"",other:false,prio:false,goal:"",note:"",nlpOff:false,tm:"",ty:String(new Date().getFullYear())};}
function dayOpts(){
  var t=today(),o=[["","Sans date"],[t,"Aujourd'hui"],[shift(t,1),"Demain"]];
  for(var i=2;i<=6;i++){var d=shift(t,i);o.push([d,fmt(d,{weekday:"short",day:"numeric"})]);}
  return o;
}
/* iPhone : si la page derrière défile quand le clavier s'ouvre, Safari dessine le curseur
   des champs de la fiche (position fixe) au mauvais endroit. On fige donc la page. */
var lockY=null;
function lockPage(){
  if(lockY!==null)return;lockY=window.scrollY||0;
  var b=document.body.style;b.position="fixed";b.top=(-lockY)+"px";b.left="0";b.right="0";b.width="100%";
}
function unlockPage(){
  if(lockY===null)return;var y=lockY;lockY=null;
  var b=document.body.style;b.position=b.top=b.left=b.right=b.width="";
  window.scrollTo(0,y);
}
function openSheet(s,from){
  sheetOpener=from||null;sheet=s;renderSheet();
  lockPage();document.body.classList.add("sheet-open");
  $("app").inert=true;$("nav").inert=true;$("fab").inert=true;
  $("sheet").scrollTop=0;
  if(s.mode==="new")setTimeout(function(){var el=$("sh-title");if(el)el.focus();},80);else $("sheet").focus();
}
/* brouillon : une fiche d'ajout fermée sans le vouloir garde ce qu'on avait tapé */
var DRAFT_KEY="closer-draft";
function draftHasText(dr){return !!(String(dr.title||"").trim()||String(dr.subject||"").trim()||String(dr.newCatName||"").trim());}
function keepDraft(){
  if(!sheet||sheet.mode!=="new"||sheet.saved||sheet.fromNote||["task","hw","daily","goal"].indexOf(sheet.kind)<0)return false;
  syncDraft();
  try{
    if(draftHasText(sheet.draft)){localStorage.setItem(DRAFT_KEY,JSON.stringify({kind:sheet.kind,draft:sheet.draft,at:Date.now()}));return true;}
    localStorage.removeItem(DRAFT_KEY);
  }catch(e){}
  return false;
}
function takeDraft(){
  try{var x=JSON.parse(localStorage.getItem(DRAFT_KEY)||"null");
    if(x&&x.draft&&Date.now()-x.at<14*864e5&&draftHasText(x.draft)){var dr=Object.assign(blankDraft(),x.draft);if(dr.due&&dr.due<today())dr.due=today();return {kind:x.kind,draft:dr};}
  }catch(e){}
  return null;
}
function dropDraft(){try{localStorage.removeItem(DRAFT_KEY);}catch(e){}}
var draftTimer=null;
document.addEventListener("input",function(ev){if(sheet&&sheet.mode==="new"&&ev.target.closest&&ev.target.closest("#sheet")){clearTimeout(draftTimer);draftTimer=setTimeout(keepDraft,400);}});
addEventListener("pagehide",keepDraft);
document.addEventListener("visibilitychange",function(){if(document.hidden)keepDraft();});

function closeSheet(){
  if(!sheet)return;
  if(keepDraft())showToast("Brouillon gardé : touche + pour le reprendre",true);
  sheet=null;document.body.classList.remove("sheet-open");
  $("app").inert=false;$("nav").inert=false;$("fab").inert=false;
  unlockPage();
  if(sheetOpener&&document.contains(sheetOpener))sheetOpener.focus({preventScroll:true});
  sheetOpener=null;
}
function syncDraft(){
  if(!sheet)return;
  var dr=sheet.draft,el;
  if((el=$("sh-title")))dr.title=el.value;
  if((el=$("sh-subj")))dr.subject=el.value;
  if((el=$("sh-newcat")))dr.newCatName=el.value;
  if((el=$("sh-due"))&&dr.other)dr.due=el.value;
  if((el=$("sh-time")))dr.time=el.value;
  if((el=$("sh-rep")))dr.rep=el.value;
  if((el=$("sh-prio")))dr.prio=el.checked;
  if((el=$("sh-goal")))dr.goal=el.value;
  if((el=$("sh-note")))dr.note=el.value;
  if((el=$("sh-tm")))dr.tm=el.value;
  if((el=$("sh-ty")))dr.ty=el.value;
}
// « Rappel à » : heure facultative, avec un avertissement si l'appareil ne reçoit pas les notifications
function pushWarn(dr){return dr.time&&!pushOn()?'<div class="pushwarn" role="note">Les notifications ne sont pas activées sur cet appareil : ce rappel n\'arrivera pas. Active-les dans Réglages › Notifications.</div>':"";}
// compact : sur une moitié de ligne, à côté de « Répéter » (l'avertissement passe en dessous, sur toute la largeur)
// heures rapides sous « Rappel à » : un toucher au lieu du sélecteur ; retoucher la même heure l'enlève
var QUICK_TIMES=[["09:00","9 h"],["12:00","12 h"],["18:00","18 h"]];
function timeQuick(dr){return '<div class="chips tquick" role="group" aria-label="Heures rapides pour le rappel">'+QUICK_TIMES.map(function(o){return sChip("stime",o[0],o[1],dr.time===o[0]);}).join("")+'</div>';}
function timeField(dr,compact){
  if(compact)return '<div class="field timefield"><div class="flab"><label for="sh-time">Rappel à</label>'+(dr.time?'<button type="button" class="linkbtn tiny" data-act="stime-clear" aria-label="Retirer le rappel">Retirer</button>':"")+'</div>'+
    '<input type="time" id="sh-time" value="'+esc(dr.time||"")+'"></div>';
  return '<div class="field timefield"><label for="sh-time">Rappel à</label><div class="trow"><input type="time" id="sh-time" value="'+esc(dr.time||"")+'">'+
    (dr.time?'<button type="button" class="linkbtn" data-act="stime-clear">Sans rappel</button>':'<span class="thint">Facultatif</span>')+'</div>'+timeQuick(dr)+pushWarn(dr)+'</div>';
}
// réglage « Toutes les options d'un coup » (retour d'une utilisatrice, 25 nov.) : gardé sur cet appareil
function allOpts(){try{return localStorage.getItem("closer-allopts")==="1";}catch(e){return false;}}
// aperçu de la date comprise dans le titre, avec « Ignorer »
function nlpHTML(dr){
  if(dr.nlpOff)return "";
  var p=parseWhen(dr.title);if(!p||!p.rest)return "";
  return '<span>Prévu <b>'+esc(whenLabel(p))+'</b></span><button type="button" class="linkbtn tiny" data-act="nlp-off">Ignorer</button>';
}
// liens trouvés dans la note : un toucher les ouvre
function noteLinks(note){
  var urls=String(note||"").match(/https?:\/\/[^\s<>"]+/g);if(!urls)return "";
  return '<div class="nlinks">'+urls.slice(0,5).map(function(u){u=u.replace(/[).,;!?]+$/,"");var host=u.replace(/^https?:\/\/(www\.)?/,"").split(/[\/?#]/)[0];
    return '<a href="'+esc(u)+'" target="_blank" rel="noopener">Ouvrir '+esc(host)+'</a>';}).join("")+'</div>';
}
function sChip(act,val,label,on){return '<button type="button" class="chip" aria-pressed="'+on+'" data-act="'+act+'" data-v="'+esc(val)+'">'+esc(label)+'</button>';}
function renderSheet(){
  if(!sheet)return;
  var k=sheet.kind, dr=sheet.draft, isNew=sheet.mode==="new", h="";
  if(k==="account"){$("sheet").innerHTML=acHTML();return;}
  if(k==="palette"){$("sheet").innerHTML=palHTML();return;}
  if(k==="backup"){
    var last="";try{last=localStorage.getItem("closer-last-export")||"";}catch(e){}
    h='<div class="sh-head"><button type="button" class="btn ghost small" data-act="ac-open">Retour</button><h2 id="sh-h">Sauvegarde</h2><span style="width:78px"></span></div>'+
      '<div class="hint" style="margin-top:0">'+(typeof SU!=="undefined"&&SU?"Tes éléments sont synchronisés sur ton compte. Une sauvegarde exportée en est une copie de secours en plus, à garder où tu veux.":"Tes données sont enregistrées dans ce navigateur, sur cet appareil uniquement. Vider les données du navigateur les efface : exporte une sauvegarde de temps en temps.")+'</div>'+
      '<div class="stack"><button type="button" class="btn" data-act="export">Exporter mes données</button>'+
      '<label class="btn ghost filebtn">Importer une sauvegarde<input type="file" id="sh-import" accept=".json,application/json"></label></div>'+
      '<div class="hint" style="margin-top:0">'+(dr.msg?esc(dr.msg):(isDate(last)?"Dernier export le "+esc(fmt(last,{day:"numeric",month:"long",year:"numeric"}))+".":"Aucun export pour l\'instant."))+'</div>'+
      '<div class="hint" style="margin-top:0">Importer ajoute les éléments du fichier à ceux déjà présents. Pour passer d\'un appareil à l\'autre : exporte sur le premier, importe sur le second.</div>';
  $("sheet").innerHTML=h;return;
  }
  if(k==="nfolders"){
    h='<div class="sh-head">'+(sheet.back?'<button type="button" class="btn ghost small" data-act="ac-open">Retour</button>':'<button type="button" class="btn ghost small" data-act="close-sheet">Fermer</button>')+'<h2 id="sh-h">'+(sheet.forNote?"Nouveau dossier":"Dossiers")+'</h2><span style="width:78px"></span></div>'+
      '<div class="addcat"><input type="text" id="sh-nfname" placeholder="Nom du dossier, ex. Cours" aria-label="Nouveau dossier" maxlength="24" autocapitalize="sentences"><button type="submit" class="btn">'+(sheet.forNote?"Créer et ranger":"Ajouter")+'</button></div>'+
      (sheet.forNote?"":'<div class="catlist">'+nFolders().map(function(c){var n=byKind("note").filter(function(x){return x.d.folder===c;}).length;return '<div class="catrow"><span>'+esc(c)+' <span style="color:var(--muted)">· '+n+'</span></span><button type="button" class="x" data-act="nf-del" data-v="'+esc(c)+'" aria-label="Supprimer le dossier '+esc(c)+'">×</button></div>';}).join("")+'</div>'+
      '<div class="hint" style="margin-top:0">Supprimer un dossier ne supprime pas ses notes : elles passent dans « Sans dossier ».</div>');
    $("sheet").innerHTML=h;return;
  }
  if(k==="cats"){
    h='<div class="sh-head">'+(sheet.back?'<button type="button" class="btn ghost small" data-act="ac-open">Retour</button>':'<button type="button" class="btn ghost small" data-act="close-sheet">Fermer</button>')+'<h2 id="sh-h">Catégories</h2><span style="width:78px"></span></div>'+
      '<div class="addcat"><input type="text" id="sh-catname" placeholder="Nouvelle catégorie, ex. Sport" aria-label="Nouvelle catégorie" maxlength="24" autocapitalize="sentences"><button type="submit" class="btn">Ajouter</button></div>'+
      '<div class="catlist">'+cats().map(function(c){return '<div class="catrow"><span>'+esc(c)+'</span><button type="button" class="x" data-act="cat-del" data-v="'+esc(c)+'" aria-label="Retirer la catégorie '+esc(c)+'">×</button></div>';}).join("")+'</div>'+
      '<div class="hint" style="margin-top:0">Retirer une catégorie ne supprime pas ses tâches : elles gardent leur étiquette.</div>';
    $("sheet").innerHTML=h;return;
  }
  h+='<div class="sh-head"><button type="button" class="btn ghost small" data-act="close-sheet">'+(sheet.streak?"Terminé":"Annuler")+'</button>'+
    '<h2 id="sh-h">'+(isNew?KIND_NEW[k]:"Modifier")+'</h2>'+
    '<button type="submit" class="btn small">'+(isNew?"Ajouter":"Enregistrer")+'</button></div>';
  if(isNew){
    // le type en une barre à 4 segments, sur une seule ligne
    h+='<div class="segc segt" role="radiogroup" aria-label="Type">'+["task","hw","daily","goal"].map(function(t){return '<button type="button" role="radio" aria-checked="'+(k===t)+'" data-act="stype" data-v="'+t+'">'+esc(cap(KIND_NAME[t]))+'</button>';}).join("")+'</div>'+
      '<div class="hint">'+KIND_HINT[k]+'</div>';
  }
  var ph={task:isNew?"Ex. Appeler la banque demain 14h":"Ex. Prendre rendez-vous",hw:isNew?"Ex. Rendre le dossier lundi":"Ex. Rendre le dossier",daily:"Ex. Lire 20 pages",goal:"Ex. Décrocher un stage",step:"Étape"}[k];
  h+='<div class="field"><label for="sh-title">Titre</label><input type="text" id="sh-title" value="'+esc(dr.title)+'" placeholder="'+ph+'" maxlength="200" autocapitalize="sentences" enterkeyhint="'+(sheet.streak?"next":"done")+'"></div>';
  if(isNew&&(k==="task"||k==="hw"))h+='<div class="nlp" id="sh-nlp" role="status" aria-live="polite">'+nlpHTML(dr)+'</div>';
  if(k==="daily"){
    h+='<div class="field"><span class="lab">Rythme</span><div class="chips scroll" role="group" aria-label="Rythme">'+
      sChip("sfreq","0","Chaque jour",!dr.freq)+sChip("sfreq","-1","Certains jours",dr.freq<0)+[1,2,3,4,5,6].map(function(n){return sChip("sfreq",String(n),n+" fois par semaine",dr.freq===n);}).join("")+'</div>'+
      // « certains jours » : les jours où l'habitude est prévue (elle n'apparaît que ces jours-là)
      (dr.freq<0?'<div class="dows" role="group" aria-label="Jours prévus">'+DOW_LETTER.map(function(l,i){var on=(dr.days||[]).indexOf(i+1)>=0;return '<button type="button" class="dow" aria-pressed="'+on+'" data-act="sday" data-v="'+(i+1)+'" aria-label="'+DOW_LONG[i]+'">'+l+'</button>';}).join("")+'</div>'+
        (normDays(dr.days).length?"":'<div class="hint" style="margin-top:4px">Aucun jour choisi : l\'habitude sera prévue chaque jour.</div>'):"")+'</div>';
    h+=timeField(dr);   // rappel de l'habitude, chaque jour où elle n'est pas encore faite
  }
  if(k==="hw"){
    h+='<div class="field"><label for="sh-subj">Matière</label><input type="text" id="sh-subj" value="'+esc(dr.subject)+'" placeholder="Ex. Finance" maxlength="40" list="sh-subjects" autocapitalize="sentences">'+
      '<datalist id="sh-subjects">'+subjectsList(false).filter(function(s){return s!=="Sans matière";}).map(function(s){return '<option value="'+esc(s)+'"></option>';}).join("")+'</datalist></div>';
  }
  if(k==="task"){
    h+='<div class="field"><span class="lab">Catégorie</span><div class="chips scroll" role="group" aria-label="Catégorie">'+allCats(dr.cat).map(function(c){return sChip("scat",c,c,!dr.newCat&&dr.cat===c);}).join("")+sChip("scat","__new","Nouvelle",dr.newCat)+'</div>'+
      (dr.newCat?'<input type="text" id="sh-newcat" value="'+esc(dr.newCatName)+'" placeholder="Nom de la catégorie, ex. Sport" aria-label="Nom de la nouvelle catégorie" maxlength="24" autocapitalize="sentences">':"")+'</div>';
  }
  var more="";
  if(k==="task"||k==="hw"){
    var opts=dayOpts(), match=opts.some(function(o){return o[0]===dr.due;});
    if(dr.due&&!match)dr.other=true;
    h+='<div class="field"><span class="lab">'+(k==="hw"?"À rendre":"Date")+'</span><div class="chips scroll" role="group" aria-label="Date">'+
      opts.map(function(o){return sChip("sdate",o[0],o[1],!dr.other&&o[0]===dr.due);}).join("")+
      sChip("sdate","other",dr.other&&isDate(dr.due)?fmt(dr.due,{day:"numeric",month:"short",year:"numeric"}):"Autre date",dr.other)+'</div>'+
      (dr.other?'<input type="date" id="sh-due" value="'+esc(dr.due)+'" aria-label="Autre date">':"")+'</div>';
    // heure du rappel et répétition : seulement quand il y a une date
    if(isDate(dr.due)){
      h+='<div class="two eq">'+timeField(dr,true)+
        '<div class="field"><label for="sh-rep">Répéter</label><select id="sh-rep">'+REPS.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===(dr.rep||"")?" selected":"")+'>'+o[1]+'</option>';}).join("")+'</select></div></div>'+timeQuick(dr)+pushWarn(dr);
    }
    more+='<div class="field"><label for="sh-note">Note</label><textarea id="sh-note" rows="3" maxlength="2000" placeholder="Détails, lien, adresse…" autocapitalize="sentences">'+esc(dr.note||"")+'</textarea>'+noteLinks(isNew?"":dr.note)+'</div>';
    more+='<label class="tick" for="sh-prio"><input type="checkbox" id="sh-prio"'+(dr.prio?" checked":"")+'> Important</label>'+
      '<div class="hint">Passe en tête de sa date et s\'affiche en gras avec une pastille « ! ».</div>';
  }
  if(k==="goal"){
    var y=new Date().getFullYear(), ys="";
    var yrs=[];for(var i=0;i<7;i++)yrs.push(String(y+i));
    if(yrs.indexOf(dr.ty)<0)yrs.unshift(dr.ty);
    yrs.forEach(function(v){ys+='<option'+(v===dr.ty?" selected":"")+'>'+esc(v)+'</option>';});
    h+='<div class="field"><span class="lab">Pour quand</span><div class="two">'+
      '<select id="sh-tm" aria-label="Mois"><option value="">Sans date</option>'+MONTHS.map(function(m,i){return '<option value="'+(i+1)+'"'+(String(i+1)===String(dr.tm)?" selected":"")+'>'+cap(m)+'</option>';}).join("")+'</select>'+
      '<select id="sh-ty" aria-label="Année">'+ys+'</select></div></div>';
  }
  if(k==="task"||k==="hw"||k==="daily"){
    var goals=byKind("goal");
    if(goals.length){
      more+='<div class="field"><label for="sh-goal">Fait avancer l\'objectif</label><select id="sh-goal"><option value="">Aucun</option>'+
        goals.map(function(g){return '<option value="'+esc(g.id)+'"'+(g.id===dr.goal?" selected":"")+'>'+esc(cap(g.d.title))+'</option>';}).join("")+'</select></div>';
    }
  }
  // options rares repliées, sauf si elles servent déjà
  if(more)h+=(dr.more||dr.prio||dr.goal||dr.note||allOpts())?more:'<button type="button" class="linkbtn moreopt" data-act="sheet-more" aria-expanded="false">Plus d\'options</button>';
  if(isNew&&(k==="task"||k==="hw"||k==="daily"))h+='<button type="button" class="btn ghost again" data-act="sheet-again">Ajouter et en saisir '+(k==="daily"?"une autre":k==="hw"?"un autre":"une autre")+'</button>'+
    (sheet.streak?'<div class="hint again-n" role="status">'+sheet.streak+(sheet.streak>1?" ajoutés":" ajouté")+' à la suite. Touche « Terminé » quand tu as fini.</div>':"");
  if(!isNew)h+='<div><button type="button" class="btn danger small" data-act="sheet-del">Supprimer '+(k==="daily"||k==="step"?"cette ":k==="goal"?"cet ":k==="hw"?"ce ":"cette ")+KIND_NAME[k]+'</button></div>';
  if(sheet.restored&&sheet.mode==="new"&&h.indexOf("sh-restored")<0)h=h.replace(/(<\/div>)/,'$1<div class="restored" id="sh-restored" role="status"><span><b>Brouillon repris</b> là où tu l\'avais laissé.</span><button type="button" class="linkbtn" data-act="draft-clear">Effacer</button></div>');
  $("sheet").innerHTML=h;
}
function saveSheet(){
  if(sheet.kind==="backup")return;
  if(sheet.kind==="account"){acPrimary();return;}
  if(sheet.kind==="nfolders"){
    var fe=$("sh-nfname"), fn=cleanFolder(fe.value);
    if(!fn){fe.focus();return;}
    var fl=nFolders();if(fl.indexOf(fn)<0){fl.push(fn);setNFolders(fl);}
    if(sheet.forNote){var fd=get(sheet.forNote);if(fd){fd.folder=fn;save(sheet.forNote,fd);}closeSheet();return;}
    renderSheet();$("sh-nfname").focus();return;
  }
  if(sheet.kind==="cats"){
    var ce=$("sh-catname"), cn=cleanCat(ce.value);
    if(!cn){ce.focus();return;}
    var cl=cats();if(cl.indexOf(cn)<0){cl.push(cn);setCats(cl);}
    renderSheet();$("sh-catname").focus();return;
  }
  syncDraft();
  var s=sheet, dr=s.draft, k=s.kind, title=cap(dr.title.trim()), now=Date.now(), chipDue=dr.due;
  if(!title){$("sh-title").focus();return;}
  // date et heure tapées dans le titre (nouvelle tâche ou nouveau devoir)
  if(s.mode==="new"&&(k==="task"||k==="hw")&&!dr.nlpOff){
    var pw=parseWhen(title);
    if(pw&&pw.rest){dr.due=pw.due;if(pw.time)dr.time=pw.time;title=cap(pw.rest);}
  }
  var note=String(dr.note||"").trim().slice(0,2000);
  if(k==="task"&&dr.newCat){
    var nc=cleanCat(dr.newCatName);
    if(!nc){$("sh-newcat").focus();return;}
    var l2=cats();if(l2.indexOf(nc)<0){l2.push(nc);setCats(l2);}
    dr.cat=nc;dr.newCat=false;
  }
  var target=dr.tm?iso(new Date(+dr.ty,+dr.tm,0)):"";
  var tm=isDate(dr.due)&&/^\d\d:\d\d$/.test(dr.time||"")?dr.time:"";
  var htm=/^\d\d:\d\d$/.test(dr.time||"")?dr.time:"";                       // heure de rappel d'une habitude
  var rep=isDate(dr.due)&&repLabel(dr.rep||"")&&dr.rep?dr.rep:"";   // heure du rappel (dr.tm, lui, est le mois d'un objectif)
  if(s.mode==="new"){
    var data;
    if(k==="task")data={kind:"task",title:title,cat:dr.cat,due:dr.due||"",time:tm,rep:rep,prio:!!dr.prio,done:false,goal:dr.goal||"",note:note,created:now};
    else if(k==="hw")data={kind:"task",title:title,cat:"Devoir",subject:cap(dr.subject.trim()),due:dr.due||"",time:tm,rep:rep,prio:!!dr.prio,done:false,goal:dr.goal||"",note:note,created:now};
    else if(k==="daily"){data=dr.freq>0?{kind:"weekly",title:title,target:dr.freq,dones:[],time:htm,goal:dr.goal||"",created:now}:{kind:"daily",title:title,lastDone:"",streak:0,time:htm,goal:dr.goal||"",created:now};if(dr.freq<0&&normDays(dr.days).length)data.days=normDays(dr.days);}
    else data={kind:"goal",title:title,target:target,steps:[],reached:false,created:now};
    if(data.rep==="month")data.repDay=parse(data.due).getDate();
    if(data.kind==="task"&&!data.note)delete data.note;
    // « Ajouter et continuer » : on enregistre et la fiche se vide pour la suivante (même type, catégorie, date et matière)
    if(s.again){
      var aid=newId();save(aid,data);dropDraft();
      var nd=blankDraft();nd.cat=dr.cat;nd.due=chipDue;nd.other=dr.other;nd.subject=dr.subject;nd.freq=dr.freq;nd.days=(dr.days||[]).slice();
      sheet={mode:"new",kind:k,draft:nd,streak:(s.streak||0)+1};
      renderSheet();if(!fxOff())haptic();
      showToast({task:"Tâche ajoutée",hw:"Devoir ajouté",daily:"Habitude ajoutée"}[k]+" : « "+shortT(title)+" »",true);
      var te=$("sh-title");if(te)te.focus();
      return;
    }
    s.saved=true;dropDraft();
    var nid=newId();if(k==="goal")setGoalOpen(nid,true);closeSheet();save(nid,data);
    var what={task:"Tâche ajoutée",hw:"Devoir ajouté",daily:"Habitude ajoutée",goal:"Objectif ajouté"}[k]||"Ajouté";
    savedFx(nid,s.fromNote?what+" : « "+(title.length>28?title.slice(0,28)+"…":title)+" »":what);
    return;
  }
  var d=get(s.id);if(!d){closeSheet();return;}
  if(k==="step"){if(d.steps&&d.steps[s.i])d.steps[s.i].t=title;}
  else{
    d.title=title;
    if(k==="task"||k==="hw"){if(note)d.note=note;else delete d.note;d.due=dr.due||"";d.time=tm;d.rep=rep;if(rep==="month")d.repDay=parse(d.due).getDate();else delete d.repDay;d.prio=!!dr.prio;d.goal=dr.goal||"";if(k==="hw")d.subject=cap(dr.subject.trim());else d.cat=dr.cat;}
    if(k==="daily"){
      d.goal=dr.goal||"";d.time=htm;
      if(dr.freq>0){if(d.kind!=="weekly"){d.kind="weekly";d.dones=[];}d.target=dr.freq;delete d.days;}
      else{
        if(d.kind==="weekly"){d.kind="daily";d.lastDone="";d.streak=0;}
        var nd=dr.freq<0?normDays(dr.days):[];
        if(nd.length)d.days=nd;else delete d.days;
      }
    }
    if(k==="goal")d.target=target;
  }
  s.saved=true;closeSheet();save(s.id,d);savedFx(s.id,"Modifications enregistrées");
}
