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
           'js/base.js': 30000, 'js/fiche.js': 29000, 'js/sync.js': 26000, 'js/demarrage.js': 9000, 'js/univers.js': 4000}
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
    c.add_init_script('window.__CLOSER_TEST=1;window.__CLOSER_NOSTATS=1;window.__CLOSER_CFG={"url":"","key":""};')
    pg = c.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); m = pg.evaluate(MESURE)
    print(f"      ouverture : contenu prêt en {m['dcl']:.0f} ms, page chargée en {m['load']:.0f} ms, plus grand élément affiché à {m['lcp']:.0f} ms, {m['res']} fichiers")
    check('ouverture rapide (contenu prêt < 1,5 s en local)', m['dcl'] < 1500, m)
    check('mise en page stable à l\'ouverture (CLS < 0,05)', m['cls'] < 0.05, m)
    check('aucune erreur à l\'ouverture', not errs, errs)
    if NPM:
        axe = open(os.path.join(CACHE, 'node_modules', 'axe-core', 'axe.min.js'), encoding='utf-8').read()
        graves = []
        pg.evaluate("""()=>{const z=n=>String(n).padStart(2,'0'),t=new Date(),d=t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate());
          localStorage.setItem('cap-items-v1',JSON.stringify([['a',{kind:'task',title:'Tâche',cat:'Perso',due:d,done:false,created:1}],
          ['b',{kind:'daily',title:'Lire',lastDone:d,streak:2,created:2}],['g',{kind:'goal',title:'Objectif',steps:[{t:'Étape',done:true}],created:3}],
          ['n',{kind:'note',title:'Note',text:'Texte',folder:'',created:4,updated:4}]]));localStorage.setItem('closer-onboard-off','1')}""")
        for theme, pal in (('light', ''), ('dark', ''), ('light', 'powder'), ('dark', 'rose'), ('light', 'midnight')):
            pg.evaluate(f"()=>{{localStorage.setItem('closer-theme','{theme}');localStorage.setItem('closer-palette','{pal}')}}")
            pg.reload(); pg.wait_for_timeout(500)
            ecrans = [('#jour', None), ('#taches', None), ('#objectifs', None), ('#brouillon', None), ('#jour', '#ac-btn'), ('#jour', 'univers'), ('#jour', '.fab')]
            for h, ouvrir in ecrans:
                if ouvrir: pg.reload(); pg.wait_for_timeout(400)   # repartir d'un écran sans fiche ouverte
                pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(250)
                clic = lambda sel: pg.evaluate("s=>document.querySelector(s).click()", sel)
                if ouvrir == 'univers': clic('#ac-btn'); pg.wait_for_timeout(300); clic('[data-act="set-pal"]'); pg.wait_for_timeout(300)
                elif ouvrir: clic(ouvrir); pg.wait_for_timeout(350)
                pg.add_script_tag(content=axe)
                res = pg.evaluate("t=>axe.run(document,{runOnly:{type:'tag',values:t},resultTypes:['violations']}).then(r=>r.violations.map(v=>({id:v.id,imp:v.impact,n:v.nodes.length,ex:v.nodes.slice(0,2).map(x=>x.target.join(' '))})))", AXE_TAGS)
                for v in res:
                    if v['imp'] in ('serious', 'critical'):
                        graves.append(f"{theme}/{pal or 'closer'} {h}{'+' + ouvrir if ouvrir else ''} : {v['id']} ×{v['n']} {v['ex']}")
        check('accessibilité : aucune erreur grave (axe-core, WCAG 2.1 AA)', not graves, '\n        '.join([''] + graves[:60]))
    c.close(); b.close()

print('\nQUALITÉ OK' if ok else '\nQUALITÉ : DES CONTRÔLES ONT ÉCHOUÉ')
sys.exit(0 if ok else 1)
