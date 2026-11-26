"""Closer · contrôles de qualité, lancés à la fin de tests/smoke.py (donc à chaque envoi sur GitHub).

  1. Univers : css/univers.css, js/univers.js, matieres/ et la liste de sw.js sont à jour (outils/univers.py)
  2. Poids : chaque fichier reste sous son budget (un gonflement soudain = un problème)
  3. JavaScript relu par ESLint (variables inconnues, doublons, code inatteignable…)
  4. Vitesse et stabilité à l'ouverture, mesurées dans le navigateur
  5. Accessibilité : axe-core (règles WCAG 2.1 A et AA) sur les écrans principaux, en clair, en sombre et dans un univers

ESLint et axe-core viennent de npm (installés une fois dans ~/.cache/closer-qualite) ; sans Node.js,
les points 3 et 5 sont sautés avec un avertissement. Lancer seul :  python3 tests/qualite.py
(avec l'appli servie sur le port 8766, comme pour smoke.py)."""
import glob, json, os, re, shutil, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get('CLOSER_URL', 'http://localhost:8766/index.html')
ENGINE = os.environ.get('ENGINE', 'chromium')
CACHE = os.path.expanduser('~/.cache/closer-qualite')
ok = True

def check(nom, cond, detail=None):
    global ok
    print(('OK   ' if cond else 'ÉCHEC'), nom, '' if cond or detail is None else '→ ' + str(detail)[:6000])
    ok = ok and bool(cond)

def lire(p): return open(os.path.join(RACINE, p), encoding='utf-8').read()

# ---------------------------------------------------------------- 1. univers
r = subprocess.run([sys.executable, os.path.join(RACINE, 'outils', 'univers.py'), '--verifier'], capture_output=True, text=True)
check('univers à jour (outils/univers.py --verifier)', r.returncode == 0, r.stdout + r.stderr)

# ---------------------------------------------------------------- 2. poids (octets, non compressés)
BUDGETS = {'index.html': 14000, 'css/closer.css': 85000, 'css/univers.css': 22000, 'sw.js': 7000,
           'js/brouillon.js': 62000, 'js/reglages.js': 46000, 'js/actions.js': 38000, 'js/vues.js': 34000,
           'js/base.js': 30000, 'js/fiche.js': 29000, 'js/sync.js': 26000, 'js/demarrage.js': 9000, 'js/univers.js': 4000, 'js/tete.js': 2400}
trop = {f: os.path.getsize(os.path.join(RACINE, f)) for f, b in BUDGETS.items() if os.path.getsize(os.path.join(RACINE, f)) > b}
check('chaque fichier sous son budget de poids', not trop, {f: f'{t} > {BUDGETS[f]}' for f, t in trop.items()})
svg = [p for p in glob.glob(os.path.join(RACINE, 'matieres', '*.svg')) if os.path.getsize(p) > 3000]
check('matières légères (< 3 Ko chacune)', not svg, svg)
nouveaux = [p for p in glob.glob(os.path.join(RACINE, 'js', '*.js')) + glob.glob(os.path.join(RACINE, 'css', '*.css'))
            if os.path.relpath(p, RACINE) not in BUDGETS]
check('tout fichier js/ et css/ a un budget', not nouveaux, nouveaux)
total = sum(os.path.getsize(os.path.join(RACINE, f)) for f in BUDGETS)
print(f'      poids total du code : {total // 1024} Ko')

# fichiers chargés par la page et préchargés pour le hors ligne : les deux listes concordent
html = lire('index.html'); sw = lire('sw.js')
charges = re.findall(r'(?:href|src)="((?:css|js)/[^"]+)"', html)
absents = [f for f in charges if f'"{f}"' not in sw]
check('chaque fichier de la page est gardé pour le hors ligne (sw.js)', not absents, absents)
inexistants = [f for f in re.findall(r'"((?:css|js|fonts|matieres)/[^"]+)"', sw) if not os.path.exists(os.path.join(RACINE, f))]
check('sw.js ne liste que des fichiers qui existent', not inexistants, inexistants)

# chaque url(...) des feuilles de style pointe vers un fichier qui existe (la police a été perdue ainsi le 23 nov.)
casses = []
for f in glob.glob(os.path.join(RACINE, 'css', '*.css')):
    for u in re.findall(r'url\((?!["\']?data:)["\']?([^"\')]+)', open(f, encoding='utf-8').read()):
        if not u.startswith(('http', '#')) and not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), u))):
            casses.append(f'{os.path.relpath(f, RACINE)} → {u}')
check('aucun lien cassé dans les CSS (polices, matières)', not casses, sorted(set(casses)))

# sécurité : aucun script, style ni module chargé depuis un site externe (tout est hébergé avec l'appli)
externes = []
for f in [os.path.join(RACINE, 'index.html'), os.path.join(RACINE, 'sw.js')] + glob.glob(os.path.join(RACINE, 'js', '*.js')) + glob.glob(os.path.join(RACINE, 'css', '*.css')):
    t = open(f, encoding='utf-8').read()
    for m in re.findall(r'(?:import\(\s*["\']|<script[^>]+src=["\']|<link(?![^>]*rel=["\']canonical)[^>]+href=["\']|@import\s+(?:url\()?["\']?)(https?:)?//', t):
        externes.append(os.path.relpath(f, RACINE))
check('aucun code chargé depuis un site externe', not externes, sorted(set(externes)))
VENDOR = {'vendor/supabase-js-2.119.2.js': 'f0032fdd21d775baf7f55b9bd76bb3cc12905188c4d594a413badaae94e86614'}
import hashlib
abime = [f for f, h in VENDOR.items() if not os.path.exists(os.path.join(RACINE, f)) or hashlib.sha256(open(os.path.join(RACINE, f), 'rb').read()).hexdigest() != h]
check('bibliothèques de vendor/ intactes (empreinte SHA-256 connue)', not abime, abime)
inconnus = [f for f in os.listdir(os.path.join(RACINE, 'vendor')) if 'vendor/' + f not in VENDOR]
check('vendor/ ne contient que des fichiers connus', not inconnus, inconnus)
html_s = lire('index.html')
check('aucun script en ligne dans index.html (exigé par la politique de sécurité)', not re.search(r'<script(?![^>]*\bsrc=)[^>]*>', html_s) and not re.search(r'\son[a-z]+=', html_s))

# ---------------------------------------------------------------- outils npm
def outils_npm():
    if not shutil.which('npm'): return False
    if not os.path.exists(os.path.join(CACHE, 'node_modules', 'axe-core', 'axe.min.js')) or \
       not os.path.exists(os.path.join(CACHE, 'node_modules', '.bin', 'eslint')):
        os.makedirs(CACHE, exist_ok=True)
        r = subprocess.run(['npm', 'install', '--prefix', CACHE, '--no-audit', '--no-fund', '--silent',
                            'eslint@9', 'globals@15', 'axe-core@4'], capture_output=True, text=True)
        if r.returncode: print('      npm :', r.stderr[-400:]); return False
    return True
NPM = outils_npm()
if not NPM: print('ATTENTION : Node.js/npm indisponible, relecture ESLint et accessibilité sautées')

# ---------------------------------------------------------------- 3. ESLint
if NPM:
    ordre = re.findall(r'<script src="(js/[^"]+)"', html)
    tmp = os.path.join(CACHE, 'tout.js')
    with open(tmp, 'w', encoding='utf-8') as f:
        bornes = []; ligne = 1
        for p in ordre:
            t = lire(p) + '\n'; bornes.append((ligne, p)); f.write(t); ligne += t.count('\n')
    # la configuration est copiée à côté de ESLint pour qu'elle trouve le paquet « globals »
    shutil.copy(os.path.join(RACINE, 'tests', 'eslint.config.mjs'), os.path.join(CACHE, 'eslint.config.mjs'))
    r = subprocess.run([os.path.join(CACHE, 'node_modules', '.bin', 'eslint'), '--format', 'json', tmp], capture_output=True, text=True, cwd=CACHE)
    try: res = json.loads(r.stdout)[0]['messages']
    except Exception: res = [{'severity': 2, 'message': 'ESLint illisible : ' + (r.stderr or r.stdout)[-300:], 'line': 0}]
    def ou(l):
        f = [p for d, p in bornes if d <= l][-1:] or ['?']; d = [d for d, p in bornes if d <= l][-1:] or [1]
        return f'{f[0]}:{l - d[0] + 1}'
    erreurs = [f"{ou(m.get('line', 0))} {m['message']}" for m in res if m['severity'] == 2]
    avert = [f"{ou(m.get('line', 0))} {m['message']}" for m in res if m['severity'] == 1]
    check('JavaScript relu par ESLint : aucune erreur', not erreurs, erreurs)
    check('JavaScript relu par ESLint : aucun avertissement', not avert, avert)

# ---------------------------------------------------------------- 4 et 5. dans le navigateur
from playwright.sync_api import sync_playwright
MESURE = """()=>new Promise(res=>{const out={cls:0,lcp:0};
  try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)out.cls+=e.value}).observe({type:'layout-shift',buffered:true})}catch(e){}
  try{new PerformanceObserver(l=>{const e=l.getEntries();if(e.length)out.lcp=e[e.length-1].startTime}).observe({type:'largest-contentful-paint',buffered:true})}catch(e){}
  setTimeout(()=>{const n=performance.getEntriesByType('navigation')[0]||{};out.dcl=n.domContentLoadedEventEnd||0;out.load=n.loadEventEnd||0;
    out.res=performance.getEntriesByType('resource').length;res(out)},1500)})"""
AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
with sync_playwright() as p:
    b = getattr(p, ENGINE).launch()
    c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=ENGINE == 'chromium', has_touch=True, locale='fr-FR', timezone_id='Europe/Paris')
    VIOL = []
    c.expose_function('__cspNote', lambda v: VIOL.append(v))
    c.add_init_script('window.__CLOSER_TEST=1;window.__CLOSER_NOSTATS=1;window.__CLOSER_CFG={"url":"","key":""};'
                      'document.addEventListener("securitypolicyviolation",e=>window.__cspNote(e.violatedDirective+" "+e.blockedURI));')
    pg = c.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); m = pg.evaluate(MESURE)
    print(f"      ouverture : contenu prêt en {m['dcl']:.0f} ms, page chargée en {m['load']:.0f} ms, plus grand élément affiché à {m['lcp']:.0f} ms, {m['res']} fichiers")
    check('ouverture rapide (contenu prêt < 1,5 s en local)', m['dcl'] < 1500, m)
    check('mise en page stable à l\'ouverture (CLS < 0,05)', m['cls'] < 0.05, m)
    check('aucune erreur à l\'ouverture', not errs, errs)
    # références ARIA et étiquettes (relevées par WAVE) : rien ne pointe vers un élément absent, vide ou caché ; chaque champ a un nom
    REFS = """()=>{const bad=[];for(const at of ['aria-labelledby','aria-controls','aria-describedby'])
      document.querySelectorAll('['+at+']').forEach(e=>e.getAttribute(at).split(/\\s+/).forEach(id=>{const t=document.getElementById(id);
        if(!t||t.hidden||(at==='aria-labelledby'&&!t.textContent.trim()))bad.push(at+'→'+id)}));
      document.querySelectorAll('input,select,textarea').forEach(e=>{if(e.type==='hidden')return;
        if(!(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||(e.id&&document.querySelector('label[for="'+e.id+'"]'))||(e.closest('label')&&e.closest('label').textContent.trim())))bad.push('sans nom : '+(e.id||e.type))});return bad}"""
    r = pg.evaluate(REFS)
    check('à l\'ouverture : références ARIA valides et champs nommés', not r, r)
    pg.evaluate("location.hash='#taches'"); pg.wait_for_timeout(250); pg.click('#tsort'); pg.wait_for_timeout(200)
    r = pg.evaluate(REFS) + ([] if pg.get_attribute('#tsort', 'aria-controls') == 'tmenu' else ['menu ouvert sans aria-controls'])
    check('menu « Trier et ranger » ouvert : références valides', not r, r)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.click('#fab'); pg.wait_for_timeout(400)
    r = pg.evaluate(REFS) + ([] if pg.get_attribute('#sheet', 'aria-labelledby') == 'sh-h' else ['fiche sans titre relié'])
    check('fiche ouverte : titre relié et champs nommés', not r, r)
    pg.goto(URL); pg.wait_for_timeout(400)
    # sécurité : la politique de la page est bien en place et bloque un site tiers ; la bibliothèque Supabase vient de l'appli
    csp = pg.evaluate("(document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')||{}).content||''")
    check('politique de sécurité présente (tout refusé par défaut, scripts et styles de l\'appli seulement, aucun style en ligne, aucun objet, aucun cadre)',
          "default-src 'none';" in csp and "script-src 'self';" in csp and "style-src 'self';" in csp and 'unsafe-inline' not in csp and "object-src 'none'" in csp and "frame-src 'none'" in csp and 'unsafe-eval' not in csp, csp)
    bloque = pg.evaluate("fetch('https://exemple.org/fuite').then(()=>false,()=>true)")
    pg.wait_for_timeout(200)
    check('un envoi vers un site tiers est bloqué', bloque and any('connect-src' in v for v in VIOL), VIOL)
    lib = pg.evaluate("import(new URL(SB_LIB,document.baseURI).href).then(m=>{const c=m.createClient('https://jnhykrfvoqyjbajmcwny.supabase.co','cle',{auth:{persistSession:false,autoRefreshToken:false}});return typeof m.createClient+' '+typeof c.from+' '+SB_LIB})")
    check('bibliothèque Supabase chargée depuis l\'appli (vendor/) et utilisable', lib.startswith('function function vendor/'), lib)

    # visite de tous les écrans (thèmes et univers) : une fois sous la politique de sécurité réelle (aucune règle
    # enfreinte), une fois avec axe-core (injecté en ligne : seulement possible si la politique est levée pour le test)
    SEED = """()=>{const z=n=>String(n).padStart(2,'0'),t=new Date(),d=t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate());
          localStorage.setItem('cap-items-v1',JSON.stringify([['a',{kind:'task',title:'Tâche',cat:'Perso',due:d,done:false,created:1,note:'voir https://exemple.org'}],
          ['b',{kind:'daily',title:'Lire',lastDone:d,streak:2,created:2}],['g',{kind:'goal',title:'Objectif',steps:[{t:'Étape',done:true}],created:3}],
          ['n',{kind:'note',title:'Note',text:'Texte',html:'<b>Texte</b>',folder:'',created:4,updated:4}]]));localStorage.setItem('closer-onboard-off','1')}"""
    def visiter(pg, axe=None):
        graves = []
        pg.evaluate(SEED)
        for theme, pal in (('light', ''), ('dark', ''), ('light', 'powder'), ('dark', 'rose'), ('light', 'midnight')):
            pg.evaluate(f"()=>{{localStorage.setItem('closer-theme','{theme}');localStorage.setItem('closer-palette','{pal}')}}")
            pg.reload(); pg.wait_for_timeout(500)
            ecrans = [('#jour', None), ('#taches', None), ('#objectifs', None), ('#brouillon', None), ('#brouillon', '.nrow'),
                      ('#jour', '#ac-btn'), ('#jour', 'univers'), ('#jour', '.fab')]
            for h, ouvrir in ecrans:
                if ouvrir: pg.reload(); pg.wait_for_timeout(400)   # repartir d'un écran sans fiche ouverte
                pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(250)
                clic = lambda sel: pg.evaluate("s=>document.querySelector(s).click()", sel)
                if ouvrir == 'univers': clic('#ac-btn'); pg.wait_for_timeout(300); clic('[data-act="set-pal"]'); pg.wait_for_timeout(300)
                elif ouvrir: clic(ouvrir); pg.wait_for_timeout(350)
                if not axe: continue
                pg.add_script_tag(content=axe)
                res = pg.evaluate("t=>axe.run(document,{runOnly:{type:'tag',values:t},resultTypes:['violations']}).then(r=>r.violations.map(v=>({id:v.id,imp:v.impact,n:v.nodes.length,ex:v.nodes.slice(0,2).map(x=>x.target.join(' '))})))", AXE_TAGS)
                for v in res:
                    if v['imp'] in ('serious', 'critical'):
                        graves.append(f"{theme}/{pal or 'closer'} {h}{'+' + ouvrir if ouvrir else ''} : {v['id']} ×{v['n']} {v['ex']}")
        return graves
    VIOL.clear(); visiter(pg); pg.wait_for_timeout(300)
    check('aucune règle de sécurité enfreinte pendant la visite de tous les écrans', not VIOL, VIOL)
    # styles calculés et surlignage du Brouillon sous la politique réelle (aucun style en ligne autorisé)
    pg.evaluate("location.hash='#objectifs'"); pg.wait_for_timeout(300)
    fill = pg.evaluate("(document.querySelector('.fill[data-gid]')||{}).style?.transform||''")
    check('barre de progression d\'objectif posée sans style en ligne', fill.startswith('scaleX('), fill)
    pg.evaluate("""()=>{const t='Jaune et vert',h='<div><span style="background-color: rgb(255, 240, 163);">Jaune</span> et <span class="hl-g">vert</span></div>';
      localStorage.setItem('cap-items-v1',JSON.stringify([['n2',{kind:'note',title:'Surlignée',text:t,html:h,hk:hsh(t),folder:'',created:5,updated:5}]]));
      localStorage.setItem('closer-theme','light');localStorage.setItem('closer-palette','')}""")
    pg.reload(); pg.wait_for_timeout(400); pg.evaluate("location.hash='#brouillon/n2'"); pg.wait_for_timeout(500)
    hl = pg.evaluate("[...document.querySelectorAll('#ne-body span')].map(s=>s.className+'='+getComputedStyle(s).backgroundColor)")
    check('surlignages du Brouillon visibles sous la politique de sécurité (anciens et nouveaux)',
          hl == ['hl-y=rgb(255, 240, 163)', 'hl-g=rgb(200, 241, 197)'], hl)
    VIOL.clear()
    pg.evaluate("""()=>{const b=document.getElementById('ne-body');b.focus();const r=document.createRange();r.selectNodeContents(b.lastChild);
      const s=getSelection();s.removeAllRanges();s.addRange(r);rteHl('b')}"""); pg.wait_for_timeout(200)
    hl2 = pg.evaluate("[...document.querySelectorAll('#ne-body span')].map(s=>s.className+'|'+(s.getAttribute('style')||'')+'|'+getComputedStyle(s).backgroundColor)")
    check('surligner une sélection fonctionne sous la politique de sécurité (classe, sans style en ligne)',
          any(x.startswith('hl-b||rgb(205, 226, 255)') for x in hl2) and not any('|background' in x for x in hl2), hl2)
    sv = pg.evaluate("(get('n2')||{}).html||''")
    check('note surlignée enregistrée avec des classes, sans style=', 'hl-b' in sv and 'style=' not in sv, sv)
    if NPM:
        ca = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=ENGINE == 'chromium', has_touch=True, locale='fr-FR', timezone_id='Europe/Paris', bypass_csp=True)
        ca.add_init_script('window.__CLOSER_TEST=1;window.__CLOSER_NOSTATS=1;window.__CLOSER_CFG={"url":"","key":""};')
        pa = ca.new_page(); pa.goto(URL)
        axe = open(os.path.join(CACHE, 'node_modules', 'axe-core', 'axe.min.js'), encoding='utf-8').read()
        graves = visiter(pa, axe)
        check('accessibilité : aucune erreur grave (axe-core, WCAG 2.1 AA)', not graves, '\n        '.join([''] + graves[:60]))
        ca.close()
    c.close(); b.close()

print('\nQUALITÉ OK' if ok else '\nQUALITÉ : DES CONTRÔLES ONT ÉCHOUÉ')
sys.exit(0 if ok else 1)
