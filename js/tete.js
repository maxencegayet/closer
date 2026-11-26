/* Closer · lu avant tout le reste (dans <head>) : thème et univers posés avant l'affichage, sans clignotement,
   et numéro de version lu dans <meta name="closer-version"> (pas de script en ligne : voir la politique de sécurité de index.html). */
var APPV=(document.querySelector('meta[name="closer-version"]')||{}).content||"";
try{
  document.documentElement.dataset.theme=localStorage.getItem("closer-theme")||"light";
  var p0=localStorage.getItem("closer-palette");if(p0)document.documentElement.dataset.pal=p0;
}catch(e){document.documentElement.dataset.theme="light";}

/* Styles calculés (largeur d'une barre, couleurs d'un aperçu d'univers…) sans attribut style= :
   la politique de sécurité (style-src 'self') bloque les styles en ligne écrits dans le HTML, mais pas ceux posés
   par le code. Le HTML généré porte data-css="propriété:valeur;…" ; on l'applique dès l'insertion (avant l'affichage).
   Seules quelques propriétés et des valeurs simples (couleurs, nombres, %, scaleX) sont acceptées. */
var CSS_OK=/^(width|transform|background|--pv-[a-z]+)$/, CSS_VAL=/^[#a-zA-Z0-9.%(),\s-]{1,60}$/;
function dynCss(root){
  if(!root||root.nodeType!==1)return;
  var l=root.matches&&root.matches("[data-css]")?[root]:[];
  if(root.querySelectorAll)l=l.concat(Array.prototype.slice.call(root.querySelectorAll("[data-css]")));
  l.forEach(function(el){
    String(el.getAttribute("data-css")).split(";").forEach(function(d){
      var i=d.indexOf(":");if(i<1)return;var k=d.slice(0,i).trim(),v=d.slice(i+1).trim();
      if(CSS_OK.test(k)&&CSS_VAL.test(v)&&!/url|expression/i.test(v))el.style.setProperty(k,v);
    });
    el.removeAttribute("data-css");
  });
}
try{new MutationObserver(function(ms){ms.forEach(function(m){for(var i=0;i<m.addedNodes.length;i++)dynCss(m.addedNodes[i]);});})
  .observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
