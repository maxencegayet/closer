/* Closer · Version et mises à jour, compte et synchronisation avec Supabase (conflits compris). */
"use strict";
/* ---------- version, mises à jour ---------- */
/* 4. bouton + : se range au défilement vers le bas */
(function(){var y=window.scrollY,f=document.getElementById("fab");
  addEventListener("scroll",function(){var n=window.scrollY,d=n-y;
    if(n<40||d<-6)f.classList.remove("away");else if(d>6)f.classList.add("away");
    if(Math.abs(d)>6)y=n;},{passive:true});
  addEventListener("hashchange",function(){f.classList.remove("away");});})();

function chkUp(){
  if(location.protocol!=="https:"&&!window.__CLOSER_TEST)return;
  fetch(location.pathname+"?v="+Date.now(),{cache:"no-store"}).then(function(r){return r.text();}).then(function(t){
    var m=t.match(/var APPV="([^"]+)"/);if(m&&m[1]!==APPV)$("upd").hidden=false;
  }).catch(function(){});
}
$("upd").addEventListener("click",function(){
  $("upd").textContent="Mise à jour…";
  var go=function(){location.reload();};
  Promise.resolve(syncTimer?syncNow():0).catch(function(){}).then(function(){
    if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration)return navigator.serviceWorker.getRegistration().then(function(rg){return rg&&rg.update();});
  }).catch(function(){}).then(go,go);
});
setTimeout(chkUp,2500);
document.addEventListener("visibilitychange",function(){if(!document.hidden)chkUp();});

/* ---------- compte et synchronisation (Supabase, projet Closer) ---------- */
var CFG=window.__CLOSER_CFG||{};
var SB_URL="url" in CFG?CFG.url:"https://jnhykrfvoqyjbajmcwny.supabase.co", SB_KEY="key" in CFG?CFG.key:"sb_publishable_pjIB1C6Uwowi8a7e94FXTA_YO85NySe";
var CONTACT="contact" in CFG?CFG.contact:"closer.todo.app@gmail.com";
var SB=null, SU=null, cst=0, sbTried=false, AS={step:"login",email:"",msg:""}, syncTimer=null, syncing=false, syncAgain=false, lastOk=0, acq=false, showPriv=false;
var sbMod=window.__CLOSER_SB||function(){return import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");};
var SK="closer-sync-v1", SY=(function(){try{return JSON.parse(localStorage.getItem(SK))||{};}catch(e){return {};}})();
function sySave(){try{localStorage.setItem(SK,JSON.stringify(SY));}catch(e){}}
function hsh(s){var x=5381;for(var i=0;i<s.length;i++)x=((x<<5)+x+s.charCodeAt(i))|0;return (x>>>0).toString(36)+"."+s.length.toString(36);}
// empreinte d'un élément, indépendante de l'ordre des champs : Supabase (jsonb) renvoie les champs dans un autre
// ordre que celui de l'envoi ; avec JSON.stringify seul, une note qu'on venait d'envoyer semblait « modifiée
// ailleurs », et chaque synchro pendant la frappe créait une copie « (autre appareil) » (corrigé le 25 nov.)
function canon(v){
  if(Array.isArray(v))return v.map(canon);
  if(v&&typeof v==="object"){var o={};Object.keys(v).sort().forEach(function(k){if(v[k]!==undefined)o[k]=canon(v[k]);});return o;}
  return v;
}
function hOf(d){return hsh(JSON.stringify(canon(d)));}
function hOld(d){return hsh(JSON.stringify(d));}
// passage à la nouvelle empreinte : ce qui était à jour le reste ; ce qui avait changé ici reste à envoyer
var SY_V=2;
function syMigrate(){
  if(SY.v===SY_V)return;
  var h={};
  Object.keys(SY.h||{}).forEach(function(id){
    var k=SY.h[id], cur=state.items.get(id);
    if(k==="x")h[id]="x";
    else if(!cur)h[id]=k;                        // supprimé ici, pas encore envoyé : la suppression partira
    else if(hOld(cur)===k)h[id]=hOf(cur);       // déjà à jour sur le serveur
  });                                            // modifié ici depuis : oublié, donc gardé et renvoyé tel quel
  SY.h=h;SY.cf={};SY.v=SY_V;
}
function acOn(){return !!(SB_URL&&SB_KEY);}
function acStart(){
  if(!acOn()||sbTried||SB)return;
  $("ac-btn").hidden=false;stat1Day("open");
  sbMod().then(function(m){
    SB=m.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:"closer-auth"}});
    return SB.auth.getSession();
  }).then(function(r){
    SU=r&&r.data&&r.data.session?r.data.session.user:null;
    if(SU)setTimeout(pushRefresh,1500);
    SB.auth.onAuthStateChange(function(ev,s){
      if(ev==="PASSWORD_RECOVERY"){AS={step:"newpw",email:"",msg:"Choisis ton nouveau mot de passe."};setTimeout(acOpen,0);}
      var nu=s?s.user:null, ch=(nu&&nu.id)!==(SU&&SU.id);SU=nu;
      if(ch&&SU)setTimeout(function(){syncNow();},0);
      acRefresh();
    });
    if(SU)syncNow();
  }).catch(function(){SB=null;}).then(function(){sbTried=true;acRefresh();});
}
function schedSync(ms){if(!SB||!SU||state.mode!=="local")return;clearTimeout(syncTimer);syncTimer=setTimeout(function(){syncTimer=null;syncNow();},ms);}
function storeLocal(){try{localStorage.setItem(LS_KEY,JSON.stringify(Array.from(state.items.entries())));}catch(e){logErr("stockage",e);storageWarn();}}
var syncErr="", syncFails=0;
function isAuthErr(e){var m=String((e&&(e.message||e.msg||e.code))||"");return (e&&(e.status===401||e.code==="PGRST301"||e.code==="PGRST303"))||/jwt|expired|token|unauthor/i.test(m);}
function errText(e){
  if(!navigator.onLine)return "pas de connexion internet";
  var m=String((e&&(e.message||e.msg))||e||"");
  if(/fetch|network|load failed/i.test(m))return "le serveur n'a pas répondu";
  if(isAuthErr(e))return "session expirée";
  return (e&&e.code?e.code+" · ":"")+m.slice(0,120);
}
async function freshSession(force){
  // remet la session à jour avant d'envoyer (Mac sorti de veille, onglet resté ouvert la nuit…)
  var r=force?await SB.auth.refreshSession():await SB.auth.getSession();
  var s=r&&r.data&&r.data.session;
  if(!s){if(force)throw {status:401,message:"session expirée"};return;}
  if(!force&&s.expires_at&&s.expires_at*1000-Date.now()<60000){return freshSession(true);}
  SU=s.user;
}
async function syncOnce(){
  if(SY.uid!==SU.id)SY={uid:SU.id,last:0,h:{},v:SY_V};
  if(!SY.h)SY.h={};
  syMigrate();
  if(!SY.cf)SY.cf={};
  var conflicts=0;
  /* 1. récupérer ce qui a changé ailleurs */
  var since=Math.max(0,(SY.last||0)-5000), from=0, changed=false, maxSeen=SY.last||0;
  for(;;){
    var r=await SB.from("closer_items").select("id,data,deleted,updated_at").gt("updated_at",since).order("updated_at",{ascending:true}).range(from,from+499);
    if(r.error)throw r.error;
    var rows=r.data||[];
    rows.forEach(function(x){
      var cur=state.items.get(x.id), ch=cur?hOf(cur):"x", known=SY.h[x.id];
      var localEdit=known===undefined?!!cur:ch!==known, rh=x.deleted?"x":hOf(x.data);
      if(localEdit&&rh!==ch&&known!==undefined&&rh!==known){
        /* modifié ici ET ailleurs depuis la dernière synchro : on ne jette rien en silence */
        if(!cur&&!x.deleted){state.items.set(x.id,x.data);SY.h[x.id]=rh;changed=true;}        // supprimé ici, modifié ailleurs : la modification gagne
        else if(cur&&!x.deleted&&cur.kind==="note"&&x.data&&x.data.kind==="note"&&SY.cf[x.id]!==rh){
          // note : la version de cet appareil reste, l'autre est gardée à côté
          var cp=Object.assign({},x.data,{title:(String(x.data.title||"").trim()||noteTitle(x.data))+" (autre appareil)",pinned:false,updated:Date.now()});
          state.items.set(newId(),cp);SY.cf[x.id]=rh;changed=true;conflicts++;
        }
        // tâches, objectifs… : la version de cet appareil est envoyée juste après
      }
      else if(!(localEdit&&rh!==ch)){
        if(x.deleted){if(cur){state.items.delete(x.id);changed=true;}}
        else if(rh!==ch){state.items.set(x.id,x.data);changed=true;}
        SY.h[x.id]=rh;
      }
      if(x.updated_at>maxSeen)maxSeen=x.updated_at;
    });
    if(rows.length<500)break;from+=500;
  }
  SY.last=maxSeen;
  if(changed){storeLocal();render();if(sheet&&sheet.kind!=="account")renderSheet();}
  if(conflicts)showToast(conflicts>1?conflicts+" notes modifiées sur deux appareils : les deux versions sont dans le Brouillon":"Note modifiée sur deux appareils : les deux versions sont dans le Brouillon",true);
  /* 2. envoyer ce qui a changé ici */
  var up=[];
  state.items.forEach(function(d,id){var hh=hOf(d);if(SY.h[id]!==hh)up.push({o:{user_id:SU.id,id:id,data:d,deleted:false},h:hh});});
  Object.keys(SY.h).forEach(function(id){if(SY.h[id]!=="x"&&!state.items.has(id))up.push({o:{user_id:SU.id,id:id,data:null,deleted:true},h:"x"});});
  for(var i=0;i<up.length;i+=200){
    var part=up.slice(i,i+200);
    var w=await SB.from("closer_items").upsert(part.map(function(u){return u.o;}));
    if(w.error)throw w.error;
    part.forEach(function(u){SY.h[u.o.id]=u.h;});
  }
  sySave();
}
async function syncNow(){
  if(!SB||!SU||state.mode!=="local")return;
  if(syncing){syncAgain=true;return;}
  syncing=true;cst=3;acRefresh();
  try{
    try{await freshSession(false);}catch(e){}
    try{await syncOnce();}
    catch(e){if(!isAuthErr(e))throw e;await freshSession(true);await syncOnce();}
    cst=1;lastOk=Date.now();syncErr="";syncFails=0;
    if(typeof phFlush==="function")phFlush();   // photos et fichiers des notes en attente d'envoi
    if(typeof phHydrate==="function"&&document.getElementById("ne-body"))phHydrate(document.getElementById("ne-body"));   // photos arrivées entre-temps
  }catch(e){
    cst=2;syncErr=errText(e);syncFails++;
    logErr("synchro",e);
  }
  syncing=false;acRefresh();
  if(syncAgain){syncAgain=false;schedSync(300);}
  else if(cst===2&&!document.hidden)schedSync(Math.min(60000,5000*Math.pow(2,syncFails-1)));
}
addEventListener("online",function(){schedSync(500);});
document.addEventListener("visibilitychange",function(){if(document.hidden){if(syncTimer){clearTimeout(syncTimer);syncTimer=null;syncNow();}}else schedSync(0);});
setInterval(function(){if(!document.hidden)schedSync(0);},60000);

function pwRules(p){return [[p.length>=8,"8 caractères"],[/[a-z]/.test(p),"une minuscule"],[/[A-Z]/.test(p),"une majuscule"],[/[0-9]/.test(p),"un chiffre"]];}
function pwOk(p){return pwRules(p).every(function(r){return r[0];});}
function pwHint(p){return "Au moins : "+pwRules(p).map(function(r){return '<span class="'+(r[0]?"on":"")+'">'+(r[0]?"✓ ":"")+r[1]+"</span>";}).join(" · ");}
var WEAK="Mot de passe trop faible : 8 caractères minimum, avec une minuscule, une majuscule et un chiffre.";
function errMsg(e){
  var m=String(e&&e.message||"").toLowerCase();
  if((e&&e.status===429)||m.indexOf("rate limit")>=0||m.indexOf("seconds")>=0)return "Trop de demandes : réessaie dans quelques minutes.";
  if(m.indexOf("invalid login")>=0)return "E-mail ou mot de passe incorrect.";
  if(m.indexOf("not confirmed")>=0)return "Adresse pas encore confirmée : clique sur le lien reçu par e-mail (regarde aussi les spams), puis reconnecte-toi ici.";
  if(m.indexOf("already registered")>=0||m.indexOf("already been registered")>=0)return "Un compte existe déjà avec cette adresse : connecte-toi.";
  if(m.indexOf("password")>=0&&(m.indexOf("least")>=0||m.indexOf("short")>=0||m.indexOf("weak")>=0||m.indexOf("character")>=0))return WEAK;
  if(m.indexOf("same")>=0&&m.indexOf("password")>=0)return "Choisis un mot de passe différent de l'ancien.";
  if(m.indexOf("fetch")>=0||m.indexOf("network")>=0)return "Pas de connexion internet.";
  return "Erreur : "+(e&&e.message||"inconnue");
}
function pwField(ac,ph,neu){
  return '<div class="field"><label for="ac-pw">Mot de passe</label><div class="pwrow"><input type="password" id="ac-pw" autocomplete="'+ac+'" placeholder="'+ph+'"'+(neu?' data-neu="1"':'')+'><button type="button" class="eye" data-act="ac-eye">Voir</button></div></div>'+
    (neu?'<div class="hint rules" id="ac-rules">'+pwHint("")+'</div>':"");
}
function emField(){return '<div class="field"><label for="ac-em">E-mail</label><input type="email" id="ac-em" inputmode="email" autocomplete="email" autocapitalize="none" value="'+esc(AS.email||"")+'" placeholder="ton@adresse.fr"></div>';}
function hm(t){return new Date(t).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});}

/* ---------- notifications (rappels à l'heure + récap du matin) ----------
   L'appareil s'abonne avec la clé publique de Supabase ; la fonction « closer-push »
   (supabase/functions/closer-push) envoie les notifications. iPhone : iOS 16.4 ou plus,
   Closer ajouté à l'écran d'accueil. */
var PUSH_URL=SB_URL+"/functions/v1/closer-push", PUSH_KEY="closer-push", MORNING_KEY="closer-morning", EVENING_KEY="closer-evening", pushBusy=false;
function pushOk(){return "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;}
function pushEndpoint(){try{return localStorage.getItem(PUSH_KEY)||"";}catch(e){return "";}}
function pushOn(){return pushOk()&&Notification.permission==="granted"&&!!pushEndpoint();}
function pushMorning(){try{var v=localStorage.getItem(MORNING_KEY);return v===null?"08:00":v;}catch(e){return "08:00";}}
// récap du soir : désactivé tant qu'on ne choisit pas d'heure
function pushEvening(){try{return localStorage.getItem(EVENING_KEY)||"";}catch(e){return "";}}
function b64uBytes(s){s=s.replace(/-/g,"+").replace(/_/g,"/");s+="===".slice((s.length+3)%4);var r=atob(s),a=new Uint8Array(r.length);for(var i=0;i<r.length;i++)a[i]=r.charCodeAt(i);return a;}
async function pushPublicKey(){
  var r=await SB.rpc("closer_vapid_public");
  if(r&&r.data)return r.data;
  var g=await fetch(PUSH_URL).then(function(x){return x.json();}).catch(function(){return null;});   // crée les clés au tout premier appel
  return g&&g.publicKey;
}
async function pushSave(sub){
  var j=sub.toJSON(), tz="Europe/Paris";
  try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||tz;}catch(e){}
  var row={endpoint:j.endpoint,user_id:SU.id,p256dh:j.keys.p256dh,auth:j.keys.auth,tz:tz,morning:pushMorning()||null};
  if(pushEvening())row.evening=pushEvening();
  var r=await SB.from("closer_push").upsert(row);
  if(r.error)throw r.error;
  try{localStorage.setItem(PUSH_KEY,j.endpoint);}catch(e){}
}
// Doit être appelé directement par le toucher (sinon l'iPhone refuse de demander l'autorisation)
function pushEnable(){
  if(!pushOk())return;
  if(!SU||!SB){showToast("Connecte-toi d'abord pour recevoir des rappels.",true);return;}
  if(pushBusy)return;pushBusy=true;
  Promise.resolve(Notification.requestPermission()).then(async function(perm){
    if(perm!=="granted"){showToast("Notifications refusées : autorise Closer dans les réglages du téléphone.",true);return;}
    var reg=await navigator.serviceWorker.ready;
    var pk=await pushPublicKey();if(!pk)throw new Error("service de notifications pas encore prêt");
    var sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uBytes(pk)});
    await pushSave(sub);
    showToast("Notifications activées",true);
  }).catch(function(e){logErr("notifications",e);showToast("Impossible d'activer les notifications ("+((e&&e.message)||e)+").",true);})
    .then(function(){pushBusy=false;if(sheet&&sheet.kind==="account")renderSheet();});
}
async function pushDisable(){
  var ep=pushEndpoint();
  try{var reg=await navigator.serviceWorker.ready, s=await reg.pushManager.getSubscription();if(s)await s.unsubscribe();}catch(e){logErr("notifications",e);}
  try{if(ep&&SB)await SB.from("closer_push").delete().eq("endpoint",ep);}catch(e){logErr("notifications",e);}
  try{localStorage.removeItem(PUSH_KEY);}catch(e){}
  showToast("Notifications désactivées",true);
  if(sheet&&sheet.kind==="account")renderSheet();
}
async function pushSetMorning(v){
  try{localStorage.setItem(MORNING_KEY,v);}catch(e){}
  var ep=pushEndpoint();
  if(ep&&SB){var r=await SB.from("closer_push").update({morning:v||null}).eq("endpoint",ep);if(r.error)logErr("notifications",r.error);}
}
async function pushSetEvening(v){
  var old=pushEvening();
  try{localStorage.setItem(EVENING_KEY,v);}catch(e){}
  var ep=pushEndpoint();
  if(ep&&SB){var r=await SB.from("closer_push").update({evening:v||null}).eq("endpoint",ep);
    if(r.error){logErr("notifications",r.error);try{localStorage.setItem(EVENING_KEY,old);}catch(e){}showToast("Le récap du soir n'a pas pu être enregistré. Réessaie plus tard.",true);}}
}
async function pushTest(){
  var ep=pushEndpoint();if(!ep)return;
  try{
    var r=await fetch(PUSH_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({test:ep})});
    var j=await r.json().catch(function(){return {};});
    if(r.ok&&j.ok)showToast("Notification d'essai envoyée : elle arrive dans quelques secondes.",true);
    else if(r.status===401)showToast("Le service de notifications refuse l'appel : réglage à terminer dans Supabase.",true);
    else{if(r.status===404){try{localStorage.removeItem(PUSH_KEY);}catch(e){}}showToast("L'essai n'est pas parti"+(j.error?" ("+j.error+")":"")+". Réactive les notifications.",true);if(sheet&&sheet.kind==="account")renderSheet();}
  }catch(e){logErr("notifications",e);showToast("Pas de réseau : essai impossible.",true);}
}
// À l'ouverture : garde l'abonnement à jour (il peut changer, et le fuseau aussi)
async function pushRefresh(){
  if(!pushOk()||!SU||!SB||Notification.permission!=="granted"||!pushEndpoint())return;
  try{var reg=await navigator.serviceWorker.ready, s=await reg.pushManager.getSubscription();
    if(s)await pushSave(s);else{localStorage.removeItem(PUSH_KEY);}
  }catch(e){logErr("notifications",e);}
}

/* ---------- abonnement au calendrier (Calendrier Apple ou autre) ----------
   La fonction « closer-ics » (supabase/functions/closer-ics) donne les tâches datées au format .ics.
   Le lien contient une clé secrète créée par closer_ics_token() (supabase/calendrier.sql) :
   Calendrier ne sait pas se connecter à un compte, la clé remplace la connexion. */
var CAL_URL=SB_URL+"/functions/v1/closer-ics", calTok="", calFor="", calq=false, calShow=false, calBusy=false;
function calGo(u){location.href=u;}   // ouvre Calendrier (remplacée dans les tests)
function calLink(){return calTok?CAL_URL+"?cle="+calTok:"";}
function calWebcal(){return calLink().replace(/^https?:/,"webcal:");}
async function calToken(renew){
  if(!SB||!SU)throw new Error("connecte-toi d'abord");
  if(calFor!==SU.id){calTok="";calFor=SU.id;}
  if(calTok&&!renew)return calTok;
  var r=await SB.rpc("closer_ics_token",{renew:!!renew});
  if(r.error||!r.data)throw (r.error||new Error("pas de lien"));
  calTok=String(r.data);return calTok;
}
function calCopy(){
  var u=calLink();
  try{if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(u).then(function(){return true;},function(){return false;});}catch(e){}
  return Promise.resolve(false);
}
async function calAct(act){
  if(calBusy)return;
  if(act!=="cal-renew")calq=false;
  try{
    if(act==="cal-add"){
      var had=!!(calTok&&calFor===SU.id);
      if(!had){calBusy=true;await calToken(false);calBusy=false;}
      calGo(calWebcal());
      showToast("Touche « S'abonner » dans Calendrier. Si rien ne s'ouvre, utilise « Copier le lien ».",true);
    }else if(act==="cal-copy"){
      if(!(calTok&&calFor===SU.id)){calBusy=true;await calToken(false);calBusy=false;}
      var done=await calCopy();
      if(done)showToast("Lien copié. Sur Mac : Calendrier › Fichier › Nouvel abonnement à un calendrier.",true);
      else{calShow=true;showToast("Copie impossible ici : sélectionne le lien affiché.",true);}
    }else if(act==="cal-renew"){
      if(!calq){calq=true;renderSheet();return;}
      calq=false;calBusy=true;await calToken(true);calBusy=false;
      showToast("Nouveau lien créé : l'ancien ne marche plus. Dans Calendrier, supprime l'ancien calendrier Closer, puis touche « Ajouter à Calendrier ».",true);
    }
  }catch(e){
    calBusy=false;logErr("calendrier",e);
    showToast("Calendrier indisponible pour le moment"+(e&&e.message?" ("+e.message+")":"")+".",true);
  }
  if(sheet&&sheet.kind==="account")renderSheet();
}
