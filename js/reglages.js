/* Closer · Page Réglages, statistiques personnelles, statistiques anonymes. */
"use strict";
/* ---------- Réglages ---------- */
var IC={
  tag:'<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  send:'<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  badge:'<rect x="3.5" y="6.5" width="14" height="14" rx="4"/><circle cx="18" cy="6" r="3"/>',
  chart:'<path d="M5 20V11M12 20V4M19 20v-7"/>',
  data:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2"/>',
  out:'<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  news:'<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  home:'<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M12 9v6M9 12h6"/>',
  sync:'<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  theme:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  fx:'<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>'
};
var CHEV='<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
var NEWS=[
  ["24 nov.","La fiche prévient quand un « Rappel à » ne pourra pas arriver parce que les notifications ne sont pas activées sur l'appareil."],
  ["24 nov.","Retards à part sur le Jour, avec « Tout reporter à aujourd'hui ». Glisse une tâche vers la droite pour la cocher, vers la gauche pour la reporter à demain. « Annuler » après chaque coche. Le + rejoint la barre du bas, le titre de l'onglet remplace « Closer », et les options rares de la fiche sont repliées."],
  ["24 nov.","Notifications : un rappel à l'heure choisie pour une tâche (« Rappel à » dans la fiche) et un récap du matin. À activer dans Réglages › Notifications, Closer ajouté à l'écran d'accueil."],
  ["23 nov.","Corrigé sur iPhone : faire défiler les dates dans une fiche ne la ferme plus, et la page ne glisse plus de côté."],
  ["23 nov.","Thème clair par défaut, avec le choix Clair, Sombre ou Auto dans Réglages › Apparence. Page Tâches rangée : sections Aujourd'hui, Demain, Cette semaine, Plus tard, repliables ; date et catégorie à droite de chaque ligne."],
  ["23 nov.","Tâches et devoirs réunis dans un seul onglet, tri rangé dans un menu, mode sombre automatique, points dans l'agenda, carte du jour plus claire. Synchro : une note modifiée sur deux appareils garde ses deux versions."],
  ["23 nov.","Closer marche de nouveau sans réseau. Objectifs repliables. Recherche du Brouillon : le mot est surligné dans la liste et dans la note, avec flèches pour passer d'un passage à l'autre."],
  ["23 nov.","Objectifs : étapes et tâches reliées réunies dans une seule liste, avec un ajout directement dans la liste. Curseur de saisie de nouveau bien placé sur iPhone."],
  ["17 nov.","Une tâche fermée par erreur reste en brouillon ; petite vibration, son et coche quand tu enregistres."],
  ["17 nov.","Réglages repensés : rouage, statistiques, préférences au même endroit, guide « écran d'accueil »."],
  ["17 nov.","Brouillon façon Notes : notes repliées, dossiers, épingles, recherche, ligne → tâche."],
  ["17 nov.","Synchro plus fiable, bloc Habitudes, historique sur 4 semaines, pastille sur l'icône."],
  ["16 nov.","Version iPhone : plein écran, gestes, glisser une fiche vers le bas pour la fermer."],
  ["16 nov.","Comptes et synchronisation entre tous tes appareils."],
  ["Novembre","Premières versions : Jour, Devoirs, Tâches, Objectifs et Brouillon."]
];
var setOpen={};
function sIcon(k,cls){return '<span class="si'+(cls?" "+cls:"")+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+IC[k]+'</svg></span>';}
function sRow(act,icon,label,opt){
  opt=opt||{};
  var sw=opt.sw!==undefined, attrs=sw?' role="switch" aria-checked="'+(!!opt.sw)+'"':(opt.exp!==undefined?' aria-expanded="'+(!!opt.exp)+'"':"");
  return '<button type="button" class="srow'+(opt.danger?" danger":"")+'" data-act="'+act+'"'+attrs+'>'+sIcon(icon,opt.danger?"red":"")+
    '<span class="sl">'+esc(label)+(opt.sub?'<small>'+esc(opt.sub)+'</small>':"")+'</span>'+
    (opt.val!==undefined?'<span class="sv">'+esc(String(opt.val))+'</span>':"")+
    (sw?'<span class="sw" aria-hidden="true"><i></i></span>':opt.noChev?"":CHEV)+'</button>';
}
function sGroup(label,rows,note){return '<section class="sgroup">'+(label?'<h3 class="slab">'+esc(label)+'</h3>':"")+'<div class="slist">'+rows+'</div>'+(note?'<p class="snote">'+note+'</p>':"")+'</section>';}
function standalone(){try{return navigator.standalone===true||matchMedia("(display-mode: standalone)").matches;}catch(e){return false;}}
function isIOS(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);}
function badgeOff(){try{return localStorage.getItem("closer-badge-off")==="1";}catch(e){return false;}}
function longestRun(days){
  var l=days.slice().sort(),best=0,run=0,prev="";
  l.forEach(function(d){run=(prev&&shift(prev,1)===d)?run+1:(prev===d?run:1);prev=d;if(run>best)best=run;});
  return best;
}
function myStats(){
  var t=today(),m=t.slice(0,7),tasks=byKind("task"),goals=byKind("goal");
  var done=tasks.filter(function(x){return x.d.done&&String(x.d.doneOn||"").slice(0,7)===m;}).length;
  var best=0;byKind("daily").forEach(function(x){best=Math.max(best,longestRun(histOf(x.d)));});
  var seances=byKind("weekly").reduce(function(n,x){return n+weekCount(x.d);},0);
  return {done:done,month:new Date().toLocaleDateString("fr-FR",{month:"long"}),best:best,goalsOk:goals.filter(function(x){return x.d.reached;}).length,goals:goals.length,notes:byKind("note").length,seances:seances};
}
function acHTML(){
  var h='<div class="sh-head"><button type="button" class="btn ghost small" data-act="close-sheet">Fermer</button><h2 id="sh-h">Réglages</h2><span style="width:78px"></span></div>';

  /* 1. Compte */
  if(!acOn()){}
  else if(!SB){h+='<div class="acbox">'+(sbTried?"Compte indisponible pour le moment (pas de connexion internet ?). Tes données restent sur cet appareil.":"Chargement…")+'</div>';}
  else if(SU&&AS.step==="newpw"){
    h+='<section class="sgroup"><h3 class="slab">Nouveau mot de passe</h3>'+pwField("new-password","Nouveau mot de passe",1)+
      '<div class="stack"><button type="submit" class="btn">Enregistrer le mot de passe</button><button type="button" class="btn ghost" data-act="ac-back">Annuler</button></div></section>';
  }else if(SU){
    var st=cst===1?"Connecté · synchronisé"+(lastOk?" à "+hm(lastOk):""):cst===3?"Connecté · synchronisation…":cst===2?(syncErr==="session expirée"?"Session expirée : déconnecte-toi puis reconnecte-toi":"Synchro en échec ("+(syncErr||"erreur inconnue")+") · nouvel essai automatique"):"Connecté";
    var em=String(SU.email||"");
    h+='<div class="prof"><span class="av" aria-hidden="true">'+esc((em[0]||"?").toUpperCase())+'</span><span class="pi"><span class="pe">'+esc(em)+'</span>'+
      '<span class="ps"><i class="acdot'+(cst===1?" ok":cst===2?" err":"")+'"></i>'+esc(st)+'</span></span>'+
      '<button type="button" class="icon" data-act="ac-sync" aria-label="Synchroniser maintenant"><svg viewBox="0 0 24 24" aria-hidden="true" class="'+(cst===3?"spin":"")+'">'+IC.sync+'</svg></button></div>';
  }else if(AS.step==="signup"){
    h+='<section class="sgroup"><h3 class="slab">Créer un compte</h3><p class="snote" style="margin:0 0 4px">Tu recevras un e-mail pour confirmer ton adresse.</p>'+emField()+pwField("new-password","8 caractères minimum",1)+
      '<div class="stack"><button type="submit" class="btn">Créer mon compte</button><button type="button" class="btn ghost" data-act="ac-tologin">J\'ai déjà un compte</button></div></section>';
  }else{
    h+='<section class="sgroup"><h3 class="slab">Compte</h3><p class="snote" style="margin:0 0 4px">Facultatif : connecte-toi pour retrouver tes éléments sur tous tes appareils. Sans compte, ils restent sur cet appareil.</p>'+emField()+pwField("current-password","Mot de passe")+
      '<div class="stack"><button type="submit" class="btn">Se connecter</button><button type="button" class="btn ghost" data-act="ac-tosignup">Créer un compte</button><button type="button" class="btn ghost" data-act="ac-forgot">Mot de passe oublié ?</button></div></section>';
  }
  if(AS.msg)h+='<div class="acbox" role="status">'+esc(AS.msg)+'</div>';
  if(AS.unconf&&!SU)h+='<div><button type="button" class="btn ghost small" data-act="ac-resend">Renvoyer l\'e-mail de confirmation</button></div>';

  /* 2. Statistiques */
  var S=myStats();
  h+='<section class="sgroup"><h3 class="slab">Tes statistiques</h3><div class="stats">'+
    '<div class="stat hl"><b>'+S.done+'</b><span>'+(S.done>1?"tâches faites":"tâche faite")+' en '+esc(S.month)+'</span></div>'+
    '<div class="stat"><b>'+(S.best||"–")+'</b><span>'+(S.best>1?"jours d'affilée, ta meilleure série":"meilleure série d'habitude")+'</span></div>'+
    '<div class="stat"><b>'+S.goalsOk+'<small> / '+S.goals+'</small></b><span>objectifs atteints</span></div>'+
    '<div class="stat"><b>'+S.seances+'</b><span>'+(S.seances>1?"séances":"séance")+' cette semaine</span></div>'+
    '</div></section>';

  /* 3. Préférences */
  var perm=("Notification" in window)?Notification.permission:"", rows="";
  rows+=sRow("set-cats","tag","Catégories de tâches",{val:cats().length});
  rows+=sRow("set-folders","folder","Dossiers du Brouillon",{val:nFolders().length});
  if(badgeOk())rows+=perm==="denied"?sRow("set-badge","badge","Pastille sur l'icône",{sub:"Refusée : réactive les notifications de Closer dans les réglages du téléphone",noChev:true}):sRow("set-badge","badge","Pastille sur l'icône",{sub:"Le nombre de choses restantes sur l'icône",sw:perm==="granted"&&!badgeOff()});
  var th=themeChoice();
  rows+='<div class="srow segrow">'+sIcon("theme")+'<span class="sl">Apparence</span><span class="segc" role="radiogroup" aria-label="Apparence">'+
    [["light","Clair"],["dark","Sombre"],["auto","Auto"]].map(function(o){return '<button type="button" role="radio" aria-checked="'+(th===o[0])+'" data-act="set-theme" data-v="'+o[0]+'"'+(o[0]==="auto"?' aria-label="Auto, comme le téléphone"':"")+'>'+o[1]+'</button>';}).join("")+'</span></div>';
  rows+=sRow("set-fx","fx","Son et vibration",{sub:"Quand tu enregistres une tâche",sw:!fxOff()});
  if(acOn())rows+=sRow("ac-stats","chart","Statistiques anonymes",{sub:statsOff()?"désactivées":"activées · aucun contenu envoyé",sw:!statsOff()});
  h+=sGroup("Préférences",rows);

  /* 3 bis. Notifications : rappels à l'heure + récap du matin */
  if(acOn()){
    var nr="", note="";
    if(!pushOk())nr=sRow("set-a2hs","bell","Rappels et récap du matin",{sub:isIOS()?"Ajoute d'abord Closer à l'écran d'accueil (iOS 16.4 ou plus)":"Ce navigateur ne reçoit pas les notifications",noChev:true});
    else if(!SU)nr=sRow("ac-open","bell","Rappels et récap du matin",{sub:"Connecte-toi pour les activer",noChev:true});
    else if(perm==="denied")nr=sRow("set-push","bell","Rappels et récap du matin",{sub:"Refusées : autorise Closer dans Réglages › Notifications du téléphone",noChev:true});
    else{
      var on=pushOn();
      nr=sRow("set-push","bell","Rappels et récap du matin",{sub:on?"Activés sur cet appareil":"Une notification à l'heure de tes tâches",sw:on});
      if(on){
        var mo=pushMorning();
        nr+='<div class="srow segrow">'+sIcon("sun")+'<span class="sl">Récap du matin</span><span class="segc" role="radiogroup" aria-label="Récap du matin">'+
          [["","Non"],["07:00","7 h"],["08:00","8 h"],["09:00","9 h"]].map(function(o){return '<button type="button" role="radio" aria-checked="'+(mo===o[0])+'" data-act="set-morning" data-v="'+o[0]+'">'+o[1]+'</button>';}).join("")+'</span></div>';
        nr+=sRow("set-push-test","send","Envoyer une notification d'essai",{noChev:true});
      }
      note="Pour être prévenu, choisis une heure dans « Rappel à » en ajoutant ou en modifiant une tâche.";
    }
    h+=sGroup("Notifications",nr,note);
  }

  /* 4. Écran d'accueil */
  if(!standalone()){
    var steps=isIOS()?["Touche le bouton Partager de Safari (le carré avec une flèche vers le haut).","Fais défiler et choisis « Sur l'écran d'accueil ».","Touche « Ajouter » : Closer s'ouvre alors comme une vraie appli, en plein écran."]
      :["Safari sur Mac : menu Fichier › « Ajouter au Dock ».","Chrome ou Edge : menu ⋮ › « Installer Closer » (ou l'icône dans la barre d'adresse).","Closer s'ouvre alors dans sa propre fenêtre."];
    h+=sGroup("",sRow("set-a2hs","home","Ajouter Closer à l'écran d'accueil",{sub:"Plein écran, pastille sur l'icône",exp:!!setOpen.a2hs})+
      (setOpen.a2hs?'<ol class="sdetail">'+steps.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ol>':""));
  }

  /* 5. Mes données */
  h+=sGroup("Mes données",sRow("backup","data","Exporter ou importer une sauvegarde",{sub:state.items.size+(state.items.size>1?" éléments":" élément")+(SU?" · synchronisés sur ton compte":" · sur cet appareil")}));

  /* 6. Sécurité */
  if(acOn()&&SB&&SU&&AS.step!=="newpw"){
    h+=sGroup("Sécurité",sRow("ac-chpw","key","Changer de mot de passe")+sRow("ac-out","out","Se déconnecter",{sub:"Tes éléments restent sur cet appareil",noChev:true})+
      sRow("ac-del","trash",acq?"Confirmer : supprimer le compte et ses données en ligne":"Supprimer mon compte",{danger:true,noChev:true}),
      acq?"Touche encore pour confirmer. Les éléments déjà sur cet appareil y restent.":"");
  }

  /* 7. À propos */
  rows=sRow("set-news","news","Quoi de neuf",{exp:!!setOpen.news,sub:"Les dernières nouveautés de Closer"});
  if(setOpen.news)rows+='<ul class="sdetail news">'+NEWS.map(function(n){return '<li><b>'+esc(n[0])+'</b>'+esc(n[1])+'</li>';}).join("")+'</ul>';
  if(CONTACT)rows+=sRow("ac-avis","mail","Donner mon avis",{sub:"Un e-mail prérempli"});
  if(acOn()){rows+=sRow("ac-priv","shield","Confidentialité",{exp:showPriv});
    if(showPriv)rows+='<div class="sdetail"><b>Sans compte</b>, tout reste sur ton appareil.<br><br><b>Avec un compte</b>, sont stockés en ligne : ton adresse e-mail et tes éléments (tâches, devoirs, habitudes, objectifs, notes). Hébergement : Supabase (Europe).<br><br><b>Utilisation</b> : uniquement pour te connecter et synchroniser tes appareils. Pas de publicité, pas de revente.<br><br><b>Accès</b> : chaque compte ne peut lire que ses propres données.<br><br><b>Statistiques anonymes</b> : un identifiant tiré au hasard sur l\'appareil, sans lien avec ton compte ni ton contenu, et seulement 4 événements (ouverture du jour, premier élément, journée active, compte créé). Désactivables ci-dessus.</div>';}
  h+=sGroup("À propos",rows);
  h+='<p class="snote" style="text-align:center">Closer · version '+APPV+'</p>';
  return h;
}
function acRefresh(){
  var dot=$("ac-dot");if(dot)dot.className="acdot"+(SU&&cst===1?" ok":SU&&cst===2?" err":"");
  if(sheet&&sheet.kind==="account"){var a=document.activeElement;if(!(a&&(a.id==="ac-em"||a.id==="ac-pw")))renderSheet();}
}
function acOpen(b){if(sheet&&sheet.kind==="account"){renderSheet();return;}acq=false;if(sheet){sheet={mode:"edit",kind:"account",draft:{}};renderSheet();$("sheet").scrollTop=0;$("sheet").focus();return;}openSheet({mode:"edit",kind:"account",draft:{}},b||$("ac-btn"));}
function acVals(){var e=$("ac-em"),p=$("ac-pw");if(e)AS.email=e.value.trim();return {em:AS.email,pw:p?p.value:""};}
function okEm(x){return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x);}
function redir(){return location.origin+location.pathname;}
function busy(t){var b=$("sheet").querySelector('[type=submit]');if(b){b.disabled=true;b.textContent=t;}}
async function acPrimary(){
  if(!SB)return;
  var v=acVals();AS.msg="";
  try{
    if(SU&&AS.step==="newpw"){
      if(!pwOk(v.pw)){AS.msg=WEAK;return renderSheet();}
      busy("Enregistrement…");var u=await SB.auth.updateUser({password:v.pw});
      if(u.error)AS.msg=errMsg(u.error);else{AS={step:"login",email:"",msg:"Mot de passe modifié."};}
    }else if(!SU&&AS.step==="signup"){
      if(!okEm(v.em)){AS.msg="Adresse e-mail invalide.";return renderSheet();}
      if(!pwOk(v.pw)){AS.msg=WEAK;return renderSheet();}
      busy("Création…");var s=await SB.auth.signUp({email:v.em,password:v.pw,options:{emailRedirectTo:redir()}});
      if(s.error)AS.msg=errMsg(s.error);
      else if(s.data&&s.data.user&&s.data.user.identities&&!s.data.user.identities.length)AS={step:"login",email:v.em,msg:"Un compte existe déjà avec cette adresse : connecte-toi."};
      else if(s.data&&s.data.session){AS={step:"login",email:"",msg:""};stat1("signup");}
      else{AS={step:"login",email:v.em,msg:"Compte créé ! Clique sur le lien de confirmation reçu par e-mail (il arrive de « Closer », regarde aussi les spams), puis connecte-toi ici."};stat1("signup");}
    }else if(!SU){
      if(!okEm(v.em)){AS.msg="Adresse e-mail invalide.";return renderSheet();}
      if(!v.pw){AS.msg="Entre ton mot de passe.";return renderSheet();}
      busy("Connexion…");var l=await SB.auth.signInWithPassword({email:v.em,password:v.pw});
      if(l.error){AS.msg=errMsg(l.error);AS.unconf=String(l.error.message||"").toLowerCase().indexOf("not confirmed")>=0;}
      else AS={step:"login",email:"",msg:""};
    }
  }catch(e){AS.msg=errMsg(e);}
  renderSheet();
}
async function acAct(act,b){
  if(act==="ac-open"){acOpen(b);return;}
  if(act==="ac-eye"){var i=$("ac-pw");if(i){i.type=i.type==="password"?"text":"password";b.textContent=i.type==="password"?"Voir":"Cacher";i.focus();}return;}
  if(act==="ac-priv"){showPriv=!showPriv;acVals();renderSheet();return;}
  if(act==="ac-stats"){try{if(statsOff())localStorage.removeItem("closer-stats-off");else localStorage.setItem("closer-stats-off","1");}catch(e){}acVals();renderSheet();return;}
  if(act==="ac-avis"){location.href="mailto:"+CONTACT+"?subject="+encodeURIComponent("Mon avis sur Closer")+"&body="+encodeURIComponent("Ce qui me plaît :\n\nCe qui me gêne :\n\nCe que j'aimerais :\n\n— Version "+APPV+errReport());return;}
  if(!SB)return;
  acVals();AS.msg="";
  if(act==="ac-tosignup"){AS.step="signup";AS.unconf=false;renderSheet();return;}
  if(act==="ac-tologin"||act==="ac-back"){AS.step="login";renderSheet();return;}
  if(act==="ac-chpw"){AS.step="newpw";renderSheet();return;}
  if(act==="ac-sync"){syncNow();return;}
  try{
    if(act==="ac-forgot"){
      if(!okEm(AS.email)){AS.msg="Entre d'abord ton adresse e-mail.";return renderSheet();}
      var f=await SB.auth.resetPasswordForEmail(AS.email,{redirectTo:redir()});
      AS.msg=f.error?errMsg(f.error):"Si un compte existe, un e-mail vient d'être envoyé. Ouvre le lien qu'il contient pour choisir un nouveau mot de passe.";
    }else if(act==="ac-resend"){
      var rs=await SB.auth.resend({type:"signup",email:AS.email,options:{emailRedirectTo:redir()}});
      AS.msg=rs.error?errMsg(rs.error):"E-mail de confirmation renvoyé (regarde aussi les spams).";AS.unconf=!!rs.error;
    }else if(act==="ac-out"){
      if(syncTimer){clearTimeout(syncTimer);syncTimer=null;await syncNow();}
      try{await SB.auth.signOut({scope:"local"});}catch(e){}
      SU=null;cst=0;SY={};try{localStorage.removeItem(SK);}catch(e){}
      AS={step:"login",email:"",msg:"Déconnecté : tes éléments restent sur cet appareil."};
    }else if(act==="ac-del"){
      if(!acq){acq=true;return renderSheet();}
      acq=false;var d=await SB.rpc("delete_my_account");
      if(d.error){AS.msg=errMsg(d.error);return renderSheet();}
      try{await SB.auth.signOut({scope:"local"});}catch(e){}
      SU=null;cst=0;SY={};try{localStorage.removeItem(SK);}catch(e){}
      AS={step:"login",email:"",msg:"Compte supprimé. Tes éléments restent sur cet appareil."};
    }
  }catch(e){AS.msg=errMsg(e);}
  renderSheet();acRefresh();
}
document.addEventListener("input",function(ev){var t=ev.target;if(t&&t.id==="ac-pw"&&t.dataset.neu){var r=$("ac-rules");if(r)r.innerHTML=pwHint(t.value);}});

/* ---------- statistiques anonymes ---------- */
function statsOff(){try{return localStorage.getItem("closer-stats-off")==="1";}catch(e){return true;}}
function aid(){try{var a=localStorage.getItem("closer-aid");if(!a){a=(crypto.randomUUID?crypto.randomUUID():"10000000-1000-4000-8000-100000000000".replace(/[018]/g,function(c){return (c^Math.random()*16>>c/4).toString(16);}));localStorage.setItem("closer-aid",a);}return a;}catch(e){return null;}}
function stat(ev){
  if(!acOn()||statsOff()||window.__CLOSER_NOSTATS)return;
  var a=aid();if(!a)return;
  try{fetch(SB_URL+"/rest/v1/closer_events",{method:"POST",keepalive:true,headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify([{aid:a,ev:ev,d:today(),v:APPV}])}).catch(function(){});}catch(e){}
}
function stat1(ev){try{if(localStorage.getItem("closer-ev-"+ev))return;localStorage.setItem("closer-ev-"+ev,"1");}catch(e){return;}stat(ev);}
function stat1Day(ev){var k="closer-ev-"+ev+"-day",t=today();try{if(localStorage.getItem(k)===t)return;localStorage.setItem(k,t);}catch(e){return;}stat(ev);}
function statDay(ev){stat1Day(ev);}
