/* Closer · lu avant tout le reste (dans <head>) : thème et univers posés avant l'affichage, sans clignotement,
   et numéro de version lu dans <meta name="closer-version"> (pas de script en ligne : voir la politique de sécurité de index.html). */
var APPV=(document.querySelector('meta[name="closer-version"]')||{}).content||"";
try{
  document.documentElement.dataset.theme=localStorage.getItem("closer-theme")||"light";
  var p0=localStorage.getItem("closer-palette");if(p0)document.documentElement.dataset.pal=p0;
}catch(e){document.documentElement.dataset.theme="light";}
