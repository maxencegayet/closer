/* Closer · Écrans Jour, Tâches (avec le filtre Devoirs), Objectifs et grille des habitudes. */
"use strict";
/* ---------- Jour ---------- */
function renderJour(){
  var t=today();
  if(!state.day||state.day<shift(t,-PAST_DAYS)||state.day>shift(t,6))state.day=t;
  var dateTxt=new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
  var dailies=byKind("daily"), tasks=byKind("task");
  var dRest=dailies.filter(function(x){return x.d.lastDone!==t;}), dDone=dailies.filter(function(x){return x.d.lastDone===t;});
  var tRest=tasks.filter(function(x){return !x.d.done&&isDate(x.d.due)&&x.d.due<=t;}).sort(sortTasks);
  var tDone=tasks.filter(function(x){return x.d.done&&x.d.doneOn===t;});
  var rest=dRest.length+tRest.length, done=dDone.length+tDone.length, total=rest+done;

  var h='<div class="date">'+esc(dateTxt)+'</div>';
  if(state.mode==="loading"){h+='<div class="msg">Chargement</div>';}
  else if(!total){h+='<div class="msg">Rien de prévu aujourd\'hui</div><div class="sub">Touche le bouton + pour ajouter une tâche ou une habitude.</div>';}
  else{
    if(!rest)h+='<div class="msg">Journée bouclée</div><div class="sub">'+done+' sur '+total+' '+(done>1?"faites":"faite")+'. '+esc(cheer(t))+'</div>';
    else{
      // même découpage que les listes en dessous : « Reste à faire » (tâches) et « Habitudes »
      var parts=[];
      if(tRest.length)parts.push(tRest.length+(tRest.length>1?" tâches":" tâche"));
      if(dRest.length)parts.push(dRest.length+(dRest.length>1?" habitudes":" habitude"));
      h+='<div class="count"><div class="num">'+rest+'</div><div class="lbl">'+(rest>1?"restantes":"restante")+'<span>'+parts.join(" et ")+'</span></div></div>';
    }
    var n=Math.min(total,40), on=Math.round(done/total*n), segs="";
    for(var i=0;i<n;i++)segs+='<i'+(i<on?' class="on"':"")+'></i>';
    h+='<div class="segs" role="img" aria-label="'+done+' sur '+total+' faites">'+segs+'</div>';
  }
  $("hero").innerHTML=h;
  if(state.mode!=="loading")setBadge(rest);
  if(prevDone!==null&&done>prevDone&&total&&total<=40&&!reduce.matches){
    var seg=$("hero").querySelectorAll(".segs i")[done-1];
    if(seg&&seg.animate)seg.animate([{transform:"scaleY(.35)",opacity:.35},{transform:"none",opacity:1}],{duration:260,easing:EASE});
  }
  // tout vient d'être fini : petit moment de fête (pas au chargement)
  if(state.mode!=="loading"&&prevRest>0&&!rest&&total&&!reduce.matches&&$("hero").animate){
    $("hero").animate([{transform:"scale(1)"},{transform:"scale(1.025)"},{transform:"scale(1)"}],{duration:420,easing:EASE});
    var mg=$("hero").querySelector(".msg");if(mg&&mg.animate)mg.animate([{opacity:0,transform:"translateY(8px)"},{opacity:1,transform:"none"}],{duration:320,easing:EASE});
  }
  if(state.mode!=="loading"){prevDone=done;prevRest=rest;}

  // bande des jours : la semaine passée à gauche (en faisant glisser), aujourd'hui et les 6 suivants
  var w="";
  for(var k=-PAST_DAYS;k<7;k++){
    var d=shift(t,k), past=k<0, c=past?doneOnDay(d).length:k===0?tRest.length:tasks.filter(function(x){return !x.d.done&&x.d.due===d;}).length;
    var dots="";for(var q=0;q<Math.min(c,3);q++)dots+="<i></i>";if(c>3)dots+="<b>+</b>";
    w+='<button type="button" class="day'+(past?" past":"")+'" data-act="day" data-id="'+d+'" aria-pressed="'+(state.day===d)+'" aria-label="'+esc(fmt(d,{weekday:"long",day:"numeric",month:"long"}))+', '+(past?(c?c+(c>1?" faites":" faite"):"rien de coché"):(c?c+(c>1?" tâches":" tâche"):"rien de prévu"))+'">'+
      '<span class="wd">'+esc(k===0?"auj.":fmt(d,{weekday:"short"}))+'</span><span class="dn">'+parse(d).getDate()+'</span><span class="ct" aria-hidden="true">'+dots+'</span></button>';
  }
  var wk0=$("week"), sl=wk0.scrollLeft;
  wk0.innerHTML=w;
  // au premier affichage, la bande s'ouvre sur aujourd'hui ; ensuite on garde la position
  if(!weekPlaced){var tb=wk0.querySelector('[data-id="'+t+'"]');if(tb&&wk0.clientWidth){wk0.scrollLeft=tb.offsetLeft-6;weekPlaced=true;}}
  else wk0.scrollLeft=sl;

  var html="";
  if(state.day===t){
    html+=onboardCard();
    var wk=byKind("weekly").sort(function(a,b){return (weekCount(a.d)>=(a.d.target||1)?1:0)-(weekCount(b.d)>=(b.d.target||1)?1:0);});
    var hasHab=dRest.length||wk.length;
    // les retards à part, repliables, avec un geste pour tout reporter ; la journée reste lisible en dessous
    var tLate=tRest.filter(function(x){return x.d.due<t;}), tToday=tRest.filter(function(x){return x.d.due===t;});
    if(tLate.length)html+=foldBlock("jour:late","En retard",tLate.length,tLate.map(function(x){return taskRow(x,true);}).join(""),"late",LATE_BTN);
    if(tToday.length||(!hasHab&&!tLate.length&&total))html+=block("Aujourd'hui",tToday.length||"",tToday.length
      ? tToday.map(function(x){return taskRow(x,true);}).join("")
      : '<div class="empty">'+(state.mode==="loading"?"Chargement…":(total?"Tout est fait pour aujourd'hui.":"Rien pour l'instant."))+'</div>');
    if(hasHab){
      // même compte que la carte noire : les habitudes du jour ; les hebdomadaires affichent leur propre « n sur x cette semaine »
      var hLeft=dRest.length;
      html+=block("Habitudes",hLeft?hLeft+" aujourd'hui":(dailies.length?"Faites aujourd'hui":""),dRest.map(dailyRow).concat(wk.map(weeklyRow)).join(""));
    }
    var und=tasks.filter(function(x){return !x.d.done&&!isDate(x.d.due);}).sort(sortTasks);
    // repliée par défaut : ce n'est pas pour aujourd'hui, la journée reste courte
    if(und.length)html+=foldBlock("jour:undated","Sans date, à caser",und.length,und.map(function(x){return taskRow(x,true);}).join(""));
    if(done)html+=block("Fait aujourd'hui",done,dDone.map(dailyRow).concat(tDone.map(function(x){return taskRow(x,true);})).join(""));
  }else if(state.day<t){
    // un jour passé : ce qui a été fait ce jour-là, et ce qui était prévu sans être fait
    var pd=state.day, got=doneOnDay(pd), miss=tasks.filter(function(x){return !x.d.done&&x.d.due===pd;}).sort(sortTasks);
    html+=block(cap(fmt(pd,{weekday:"long",day:"numeric",month:"long"})),got.length?got.length+(got.length>1?" faites":" faite"):"",
      got.length?got.map(function(x){return x.d.kind==="task"?taskRow(x,true):pastHabRow(x);}).join(""):'<div class="empty">Rien de coché ce jour-là.</div>');
    if(miss.length)html+=block("Prévu, pas encore fait",miss.length,miss.map(function(x){return taskRow(x,true);}).join(""),"late");
  }else{
    var day=tasks.filter(function(x){return x.d.due===state.day;}).sort(function(a,b){return (a.d.done?1:0)-(b.d.done?1:0)||sortTasks(a,b);});
    html+=block(fmt(state.day,{weekday:"long",day:"numeric",month:"long"}),day.filter(function(x){return !x.d.done;}).length||"",
      day.length?day.map(function(x){return taskRow(x,true);}).join(""):'<div class="empty">Rien de prévu ce jour-là. Touche + pour y ajouter quelque chose.</div>');
  }
  $("l-jour").innerHTML=html;
}

var PAST_DAYS=7, weekPlaced=false, prevRest=null;
// ce qui a été coché un jour donné : habitudes faites ce jour-là, puis tâches terminées ce jour-là
function doneOnDay(day){
  var hb=byKind("daily").concat(byKind("weekly")).filter(function(x){return histOf(x.d).indexOf(day)>=0;});
  return hb.concat(byKind("task").filter(function(x){return x.d.done&&x.d.doneOn===day;}).sort(function(a,b){return (a.d.doneAt||0)-(b.d.doneAt||0);}));
}
function pastHabRow(x){
  var ti=cap(x.d.title);
  return '<div class="row done"><span class="check round on" aria-hidden="true">'+CHECK+'</span>'+
    '<button type="button" class="body" data-act="edit" data-id="'+esc(x.id)+'" aria-label="Habitude faite : '+esc(ti)+'"><span class="title">'+esc(ti)+'</span><span class="meta"><span>Habitude</span></span></button></div>';
}
// une phrase pour la journée bouclée, qui change d'un jour à l'autre
var CHEERS=["Bien joué.","Le reste de la journée est à toi.","Rien ne traîne : profites-en.","Demain repart sur de bonnes bases.","Belle régularité."];
function cheer(t){var n=0;for(var i=0;i<t.length;i++)n+=t.charCodeAt(i)*(i+1);return CHEERS[n%CHEERS.length];}

/* ---------- premiers pas : 3 étapes, puis la carte disparaît ---------- */
var ONB_KEY="closer-onboard-off";
function onboardSteps(){
  var st=[{done:byKind("task").length>0,txt:"Ajoute ta première tâche",act:"add",btn:"Ajouter"},
          {done:standalone(),txt:"Ajoute Closer à l'écran d'accueil",act:"ac-open",btn:"Comment"}];
  if(acOn())st.push({done:pushOn(),txt:SU?"Active les rappels":"Crée ton compte, puis active les rappels",act:"ac-open",btn:"Réglages"});
  return st;
}
function onboardCard(){
  try{if(localStorage.getItem(ONB_KEY)==="1")return "";}catch(e){}
  if(state.mode==="loading")return "";
  var st=onboardSteps(), n=st.filter(function(x){return x.done;}).length;
  if(n===st.length)return "";
  return '<section class="onb" aria-label="Premiers pas"><div class="onb-h"><b>Premiers pas</b><span>'+n+' sur '+st.length+'</span><button type="button" class="linkbtn" data-act="onb-off">Masquer</button></div>'+
    st.map(function(x){return '<div class="onb-r'+(x.done?" ok":"")+'"><span class="onb-c" aria-hidden="true">'+(x.done?'<svg viewBox="0 0 12 12"><path d="M2.5 6.2l2.3 2.3L9.5 3.8"/></svg>':"")+'</span><span class="onb-t">'+esc(x.txt)+(x.done?'<span class="sr"> (fait)</span>':"")+'</span>'+(x.done?"":'<button type="button" class="btn ghost small" data-act="'+x.act+'">'+x.btn+'</button>')+'</div>';}).join("")+'</section>';
}

/* ---------- Devoirs et Tâches ---------- */
function chipsHtml(key,opts){
  return opts.map(function(c){
    return '<button type="button" class="chip" aria-pressed="'+(state[key]===c)+'" data-act="filter" data-k="'+key+'" data-id="'+esc(c)+'">'+esc(c)+'</button>';
  }).join("");
}
function subjectsList(openOnly){
  var subs=[];
  byKind("task").forEach(function(x){if(x.d.cat==="Devoir"&&(!openOnly||!x.d.done)){var s=cap(x.d.subject||"")||"Sans matière";if(subs.indexOf(s)<0)subs.push(s);}});
  return subs.sort(function(a,b){return a.localeCompare(b,"fr");});
}
// Tâches et devoirs dans le même onglet : « Devoirs » est un filtre (clé « devoirs » pour garder ses réglages)
function taskKey(){return state.filter==="Devoirs"?"devoirs":"taches";}
function addKind(){return curView==="objectifs"?"goal":(curView==="taches"&&state.filter==="Devoirs")?"hw":"task";}
function viewTasks(v){
  return byKind("task").filter(function(x){
    if(v==="devoirs")return x.d.cat==="Devoir";
    return state.filter==="Tout"||x.d.cat===state.filter;
  });
}
function renderTaches(){
  var cl=allCats(), openAll=byKind("task").filter(function(x){return !x.d.done;});
  if(state.filter!=="Tout"&&state.filter!=="Devoirs"&&cl.indexOf(state.filter)<0)state.filter="Tout";
  // seules les catégories qui ont quelque chose à faire ont un bouton (plus celle choisie)
  var has=function(c){return c===state.filter||openAll.some(function(x){return c==="Devoirs"?x.d.cat==="Devoir":x.d.cat===c;});};
  $("chips").innerHTML=chipsHtml("filter",["Tout"].concat(["Devoirs"].concat(cl).filter(has)));
  var v=taskKey(), info=renderTaskView(v,"l-tasks",v==="devoirs"?"Aucun devoir en cours. Touche + pour noter le prochain.":state.filter==="Tout"?"Aucune tâche en cours. Touche + pour noter la prochaine.":"Rien à faire dans « "+state.filter+" ».");
  // résumé d'une ligne sous le titre
  var late=info.late;
  $("tsum").innerHTML=info.open?(info.open+" à faire"+(late?' · <span class="late">'+late+" en retard</span>":"")):"";
  // menu « Trier et ranger »
  var mode=groupMode(v), canGroup=state.filter==="Tout"||v==="devoirs";
  if(!canGroup&&mode==="group")mode="date";
  var item=function(act,val,label,on){return '<button type="button" role="'+(on===null?"menuitem":"menuitemradio")+'"'+(on===null?"":' aria-checked="'+on+'"')+' data-act="'+act+'" data-k="'+v+'"'+(val?' data-v="'+val+'"':"")+'><span>'+label+'</span>'+(on?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>':"")+'</button>';};
  var m='<div class="tm-h">Trier</div>'+item("group","date","Par date",mode==="date");
  if(canGroup)m+=item("group","group",v==="devoirs"?"Par matière":"Par catégorie",mode==="group");
  m+='<hr>';
  if(info.open>1)m+=item("arr","","Ranger à la main",null);
  m+=item("cats","","Gérer les catégories",null);
  $("tmenu").innerHTML=m;$("tmenu").hidden=!state.tmenu;$("tsort").setAttribute("aria-expanded",String(!!state.tmenu));
  $("tsort").classList.toggle("on",mode==="group"||!!state.arr[v]);
}
function renderTaskView(v,target,emptyTxt){
  var t=today(), all=viewTasks(v), mode=groupMode(v), arr=state.arr[v], isHw=v==="devoirs";
  if(!isHw&&state.filter!=="Tout")mode="date";
  var open=all.filter(function(x){return !x.d.done;});
  var catShown=state.filter==="Tout"||isHw;           // la catégorie (ou la matière) n'est utile que si elle varie
  var groups=[];                                     // [titre, classe, lignes, date masquée, catégorie masquée, clé de repli]
  if(mode==="date"){
    open.sort(sortTasks);
    var wk=shift(t,6);
    groups=[
      ["En retard","late",open.filter(function(x){return isDate(x.d.due)&&x.d.due<t;}),false,!catShown,"late"],
      ["Aujourd'hui","",open.filter(function(x){return x.d.due===t;}),true,!catShown,"today"],
      ["Demain","",open.filter(function(x){return x.d.due===shift(t,1);}),true,!catShown,"tomorrow"],
      ["Cette semaine","",open.filter(function(x){return isDate(x.d.due)&&x.d.due>shift(t,1)&&x.d.due<=wk;}),false,!catShown,"week"],
      ["Plus tard","",open.filter(function(x){return isDate(x.d.due)&&x.d.due>wk;}),false,!catShown,"later"],
      ["Sans date","",open.filter(function(x){return !isDate(x.d.due);}),true,!catShown,"nodate"]
    ];
  }else{
    (isHw?subjectsList(true):allCats().concat(["Devoir"])).forEach(function(k){
      groups.push([!isHw&&k==="Devoir"?"Devoirs":k,"",open.filter(function(x){return isHw?(cap(x.d.subject||"")||"Sans matière")===k:x.d.cat===k;}).sort(ordCSort),false,true,"c:"+k]);
    });
  }
  groups=groups.filter(function(g){return g[2].length;});
  if(open.length<2)arr=state.arr[v]=false;
  orderGroups[v]=groups.map(function(g){return g[2].map(function(x){return x.id;});});
  var html="";
  orderModes[v]=mode;
  if(arr)html+='<div class="arrbar" role="status"><span id="arr-help-'+v+'">'+(mode==="date"?"Fais glisser la poignée pour ranger les tâches d'un même jour.":"Fais glisser la poignée pour ranger chaque groupe.")+'<span class="sr"> Au clavier : flèches haut et bas.</span></span><button type="button" class="btn small" id="arr-'+v+'" data-act="arr" data-k="'+v+'">Terminé</button></div>';
  groups.forEach(function(g,gi){
    var rows=g[2].map(function(x,i){
      var a=null;
      if(arr){
        var pv=g[2][i-1],nx=g[2][i+1];
        a={v:v,g:gi,up:!!pv&&(mode!=="date"||dueCmp(pv,x)===0),down:!!nx&&(mode!=="date"||dueCmp(nx,x)===0)};
      }
      return taskRow(x,g[3],a,g[4]);
    }).join("");
    // en mode rangement, tout est déplié ; « En retard » ne se replie jamais
    if(g[5]==="late")html+=arr?block(g[0],g[2].length,rows,g[1]):foldBlock(v+":late",g[0],g[2].length,rows,g[1],LATE_BTN);
    else html+=arr?block(g[0],g[2].length,rows,g[1]):foldBlock(v+":"+g[5],g[0],g[2].length,rows,g[1]);
  });
  if(!open.length){
    if(state.mode==="loading")html+='<div class="list"><div class="empty">Chargement…</div></div>';
    else if(isHw&&!all.length)html+=emptyState("Aucun devoir en cours","Note chaque devoir avec sa matière et sa date de rendu : il apparaîtra le bon jour, et tu peux te faire rappeler à l'heure de ton choix.","Ajouter un devoir");
    else if(!isHw&&state.filter==="Tout"&&!all.length)html+=emptyState("Aucune tâche pour l'instant","Note tout ce que tu as à faire. Avec une date, elle s'affiche le bon jour ; avec une heure, Closer te le rappelle.","Ajouter une tâche");
    else html+='<div class="list"><div class="empty">'+esc(emptyTxt)+'</div></div>';
  }
  var done=all.filter(function(x){return x.d.done;}).sort(function(a,b){return (b.d.doneAt||0)-(a.d.doneAt||0);});
  if(done.length&&!arr){
    html+=foldBlock(v+":done","Terminées",done.length,done.slice(0,50).map(function(x){return taskRow(x,false,null,!catShown);}).join(""),"",
      '<button type="button" class="linkbtn" data-act="clear-done" data-id="'+v+'" style="margin:2px 8px 0">Supprimer les terminées</button>');
  }
  $(target).innerHTML=html;
  return {open:open.length,late:open.filter(function(x){return isDate(x.d.due)&&x.d.due<t;}).length};
}

/* ---------- Objectifs ---------- */
// objectifs dépliés : gardés sur l'appareil
var GOALS_OPEN_KEY="closer-goals-open";
function goalsOpen(){try{var l=JSON.parse(localStorage.getItem(GOALS_OPEN_KEY)||"[]");return Array.isArray(l)?l:[];}catch(e){return [];}}
function goalOpen(id){return goalsOpen().indexOf(id)>=0;}
function setGoalOpen(id,on){var l=goalsOpen().filter(function(x){return x!==id;});if(on)l.push(id);try{localStorage.setItem(GOALS_OPEN_KEY,JSON.stringify(l));}catch(e){}}
function renderObjectifs(){
  var t=today(), goals=byKind("goal");
  if(!goals.length){$("l-goals").innerHTML=state.mode==="loading"?'<div class="list"><div class="empty">Chargement…</div></div>':emptyState("Aucun objectif pour l'instant","Un objectif, c'est un cap à quelques mois : un stage, un examen, un niveau en anglais. Découpe-le en étapes et relie-lui tes tâches pour voir où tu en es.","Créer un objectif");return;}
  var dailies=byKind("daily"), tasks=byKind("task");
  $("l-goals").innerHTML=goals.map(function(g){
    var d=g.d, steps=Array.isArray(d.steps)?d.steps:[], ti=cap(d.title);
    var lt=tasks.filter(function(x){return x.d.goal===g.id;}).sort(function(a,b){return (a.d.done?1:0)-(b.d.done?1:0)||sortTasks(a,b);});
    // une seule liste : les étapes puis les tâches reliées ; toutes comptent dans l'avancée
    var tot=steps.length+lt.length, nd=steps.filter(function(s){return s.done;}).length+lt.filter(function(x){return x.d.done;}).length;
    var pct=d.reached?100:(tot?Math.round(nd/tot*100):0);
    var when="";
    if(isDate(d.target)){
      var n=diffDays(d.target,t);
      when='<div class="when">D\'ici '+esc(fmt(d.target,{month:"long",year:"numeric"}))+
        (d.reached?"":(n>=0?'<b>J-'+n+'</b>':'<b class="late">Dépassé de '+(-n)+' j</b>'))+'</div>';
    }
    var rows=steps.map(function(s,i){
      var st=cap(s.t);
      return {done:!!s.done,t:st,h:'<div class="step'+(s.done?" done":"")+'">'+checkBtn("step",g.id,s.done,(s.done?"Décocher : ":"Cocher : ")+st,' data-i="'+i+'"')+
        '<button type="button" class="body" data-act="edit-step" data-id="'+esc(g.id)+'" data-i="'+i+'" aria-label="Modifier : '+esc(st)+'"><span class="title">'+esc(st)+'</span></button></div>'};
    }).concat(lt.map(function(x){
      var st=cap(x.d.title);
      return {done:!!x.d.done,t:st,h:'<div class="step'+(x.d.done?" done":"")+'">'+checkBtn("task",x.id,x.d.done,(x.d.done?"Décocher : ":"Cocher : ")+st)+
        '<button type="button" class="body" data-act="edit" data-id="'+esc(x.id)+'" aria-label="Modifier : '+esc(st)+'"><span class="title">'+esc(st)+'</span>'+(isDate(x.d.due)&&!x.d.done?dueSpan(x.d.due,false):"")+'</button></div>'};
    }));
    // ce qui reste à faire d'abord, ce qui est fait en bas (ordre conservé dans chaque groupe)
    rows=rows.filter(function(r){return !r.done;}).concat(rows.filter(function(r){return r.done;}));
    var lk=dailies.filter(function(x){return x.d.goal===g.id;}).map(function(x){
      var s=streakOf(x.d);
      return '<button type="button" class="lk" data-act="edit" data-id="'+esc(x.id)+'">'+esc(cap(x.d.title))+'<span>Chaque jour</span>'+(s>1?'<span class="credit">'+s+' jours de suite</span>':"")+'</button>';
    }).concat(byKind("weekly").filter(function(x){return x.d.goal===g.id;}).map(function(x){
      return '<button type="button" class="lk" data-act="edit" data-id="'+esc(x.id)+'">'+esc(cap(x.d.title))+'<span>'+weekCount(x.d)+' sur '+(x.d.target||1)+' cette semaine</span></button>';
    }));
    var open=goalOpen(g.id), left=tot-nd, nxt=rows.length&&left?rows[0].t:"";
    var sum=d.reached?"Objectif atteint":!tot?"Aucune tâche pour l'instant":!left?"Tout est fait":nd+" sur "+tot+" fait"+(nd>1?"s":"")+(nxt?" · Ensuite : "+nxt:"");
    return '<article class="goal'+(d.reached?" reached":"")+(open?" open":"")+'">'+
      '<button type="button" class="goal-head" data-act="goal-fold" data-id="'+esc(g.id)+'" aria-expanded="'+open+'" aria-controls="gb-'+esc(g.id)+'">'+
        '<span class="t">'+esc(ti)+'</span><span class="pct">'+pct+' %</span>'+
        '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>'+
      when+
      '<div class="track"><div class="fill" data-gid="'+esc(g.id)+'" data-p="'+pct+'" style="transform:scaleX('+(pct/100)+')"></div></div>'+
      (open?"":'<div class="gsum">'+esc(sum)+'</div>')+
      '<div class="gbody" id="gb-'+esc(g.id)+'"'+(open?"":" hidden")+'>'+
      '<div class="steps">'+rows.map(function(r){return r.h;}).join("")+
        '<form class="addstep step" data-goal="'+esc(g.id)+'"><span class="check ghostcheck" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M6 2v8M2 6h8"/></svg></span>'+
        '<input type="text" id="step-in-'+esc(g.id)+'" placeholder="Ajouter une tâche" aria-label="Nouvelle tâche pour '+esc(ti)+'" maxlength="200" autocapitalize="sentences" enterkeyhint="done">'+
        '<button class="addgo" type="submit" aria-label="Ajouter"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg></button></form>'+
      '</div>'+
      (lk.length?'<div class="linked"><h3>Habitudes qui le font avancer</h3>'+lk.join("")+'</div>':"")+
      '<div class="gfoot"><button type="button" class="linkbtn" data-act="edit" data-id="'+esc(g.id)+'">Modifier l\'objectif</button><button type="button" class="linkbtn" data-act="reach" data-id="'+esc(g.id)+'">'+(d.reached?"Rouvrir l'objectif":"Marquer comme atteint")+'</button></div>'+
      '</div>'+
      '</article>';
  }).join("");
}

/* ---------- Habitudes : 4 dernières semaines ---------- */
function histOf(d){
  var l=(d.dones||[]).slice();
  // anciennes habitudes sans historique : on reconstitue la série en cours
  if(d.kind==="daily"&&isDate(d.lastDone)){for(var i=0;i<(d.streak||1);i++){var x=shift(d.lastDone,-i);if(l.indexOf(x)<0)l.push(x);}}
  return l;
}
function renderHabits(){
  var hs=byKind("daily").concat(byKind("weekly")), el=$("l-habits");
  if(!hs.length){el.innerHTML="";return;}
  var t=today(), ws=weekStart(t), first=shift(ws,-21);
  el.innerHTML='<section class="block"><div class="sh"><h2>Habitudes</h2><span class="n">4 dernières semaines</span></div><div class="list">'+hs.map(function(x){
    var d=x.d, h=histOf(d), cells="", n=0;
    for(var i=0;i<28;i++){var day=shift(first,i), on=h.indexOf(day)>=0, fut=day>t;if(on&&!fut)n++;
      if(i%7===0)cells+=(i?'</span>':'')+'<span class="wk">';
      cells+='<i class="'+(on?"on":"")+(fut?" fut":"")+(day===t?" now":"")+'"></i>';}
    cells+='</span>';
    var meta=d.kind==="daily"
      ? (streakOf(d)>1?'<span class="credit">'+streakOf(d)+' jours de suite</span>':'<span>Chaque jour</span>')+'<span>'+n+' jours sur 28</span>'
      : '<span>'+(d.target||1)+' fois par semaine</span><span>'+weekCount(d)+' sur '+(d.target||1)+' cette semaine</span>';
    return '<div class="hab"><button type="button" class="body" data-act="edit" data-id="'+esc(x.id)+'" aria-label="Modifier : '+esc(cap(d.title))+'"><span class="title">'+esc(cap(d.title))+'</span><span class="meta">'+meta+'</span></button>'+
      '<div class="grid" role="img" aria-label="'+n+' fois sur les 4 dernières semaines">'+cells+'</div></div>';
  }).join("")+'</div></section>';
}
function animateFills(){
  document.querySelectorAll(".fill[data-gid]").forEach(function(el){
    var id=el.dataset.gid,p=+el.dataset.p,o=prevPct[id];prevPct[id]=p;
    if(o===undefined||o===p||reduce.matches||!el.animate)return;
    el.animate([{transform:"scaleX("+(o/100)+")"},{transform:"scaleX("+(p/100)+")"}],{duration:250,easing:EASE});
  });
}
