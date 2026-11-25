"""Tests de fumée de Closer (navigateur réel, sans réseau : Supabase est simulé).
Lancer depuis la racine du dépôt :  python3 -m http.server 8766 &  puis  python3 tests/smoke.py
Nécessite : pip install playwright  (et un Chrome/Chromium)."""
import json, os, sys, itertools
from playwright.sync_api import sync_playwright

URL = os.environ.get('CLOSER_URL', 'http://localhost:8766/index.html')
# Moteur : chromium (par défaut) ou webkit, celui de Safari :  ENGINE=webkit python3 tests/smoke.py
ENGINE = os.environ.get('ENGINE', 'chromium')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
LAUNCH = {'args': ['--no-sandbox']} if ENGINE == 'chromium' else {}
if ENGINE == 'chromium' and CHROME and os.path.exists(CHROME):
    LAUNCH['executable_path'] = CHROME

# Gestes au doigt. Chromium : vrais événements tactiles (protocole du navigateur).
# WebKit n'a pas ce protocole : on envoie les mêmes touchstart / touchmove / touchend depuis la page,
# sur l'élément touché au départ, comme le fait Safari.
TOUCH_JS = r"""(a)=>{
  const ty={touchStart:'touchstart',touchMove:'touchmove',touchEnd:'touchend'}[a.type];
  const p=a.pts[0]||window.__tlast;
  if(ty==='touchstart')window.__tt=document.elementFromPoint(p.x,p.y);
  const tg=window.__tt||document.body;
  const mk=q=>({identifier:1,target:tg,clientX:q.x,clientY:q.y,pageX:q.x+scrollX,pageY:q.y+scrollY,screenX:q.x,screenY:q.y});
  const list=a.pts.map(mk), ch=[mk(p)];
  const ev=new Event(ty,{bubbles:true,cancelable:ty!=='touchend'});
  for(const [k,v] of [['touches',list],['targetTouches',list],['changedTouches',ch]])Object.defineProperty(ev,k,{value:v});
  tg.dispatchEvent(ev);window.__tlast=p;
}"""
class Touch:
    def __init__(self, c, pg):
        self.pg = pg
        self.cdp = c.new_cdp_session(pg) if ENGINE == 'chromium' and not os.environ.get('JS_TOUCH') else None
    def send(self, type_, pts):
        if self.cdp:
            self.cdp.send('Input.dispatchTouchEvent', {'type': type_, 'touchPoints': pts})
        else:
            self.pg.evaluate(TOUCH_JS, {'type': type_, 'pts': pts})
SB = 'https://test.supabase.co'
CFG = {'url': SB, 'key': 'sb_publishable_test', 'contact': 'test@exemple.fr'}

# --- faux Supabase, partagé par tous les « appareils » du test ---
MOCK_JS = r"""
export function createClient(){
  const cbs=[]; const call=(op,a)=>window.__srv(op,JSON.stringify(a)).then(r=>JSON.parse(r));
  const cur=()=>{const s=JSON.parse(localStorage.getItem('mock-sess')||'null');return s&&s.user.id;};
  const auth={
    getSession:async()=>({data:{session:JSON.parse(localStorage.getItem('mock-sess')||'null')}}),
    onAuthStateChange(f){cbs.push(f);return {data:{subscription:{unsubscribe(){}}}};},
    async signInWithPassword(a){const r=await call('login',a);if(r.error)return r;const s={user:r.user};localStorage.setItem('mock-sess',JSON.stringify(s));setTimeout(()=>cbs.forEach(f=>f('SIGNED_IN',s)));return {error:null};},
    async signUp(a){return call('signup',a);},
    async signOut(){localStorage.removeItem('mock-sess');cbs.forEach(f=>f('SIGNED_OUT',null));return {error:null};},
    async refreshSession(){window.__refreshed=(window.__refreshed||0)+1;return {data:{session:JSON.parse(localStorage.getItem('mock-sess')||'null')}};},
    async resetPasswordForEmail(){return {error:null};}, async resend(){return {error:null};}, async updateUser(){return {error:null};}
  };
  function from(){const q={};const b={select(){return b;},gt(c,v){q.gt=v;return b;},order(){return b;},
    range(a,z){q.range=[a,z];q.uid=cur();return call('select',q);},
    upsert(rows){return call('upsert',{rows,uid:cur()});},
    update(v){return {eq(){(window.__upd=window.__upd||[]).push(v);return Promise.resolve({error:null});}};}};return b;}
  return {auth,from,rpc:async(n,args)=>call('rpc',{n,args:args||{},uid:cur()})};
}
"""
USERS, ROWS, EVENTS, ICS = {}, {}, [], {}
FAIL = {'jwt': 0}
CLOCK = itertools.count(1_700_000_000_000, 1000)

def srv(op, raw):
    a = json.loads(raw)
    if op == 'signup':
        if a['email'] in USERS:
            return json.dumps({'data': {'user': {'identities': []}, 'session': None}, 'error': None})
        USERS[a['email']] = {'pw': a['password'], 'id': 'u-' + str(len(USERS) + 1), 'conf': True}
        return json.dumps({'data': {'user': {'identities': [{}]}, 'session': None}, 'error': None})
    if op == 'login':
        u = USERS.get(a['email'])
        if not u or u['pw'] != a['password']:
            return json.dumps({'error': {'message': 'Invalid login credentials'}})
        return json.dumps({'user': {'id': u['id'], 'email': a['email']}})
    if op == 'select':
        rows = sorted((r for (uid, _), r in ROWS.items() if uid == a['uid'] and r['updated_at'] > a.get('gt', 0)), key=lambda r: r['updated_at'])
        z0, z1 = a['range']
        return json.dumps({'data': rows[z0:z1 + 1], 'error': None})
    if op == 'upsert':
        if FAIL['jwt'] > 0:
            FAIL['jwt'] -= 1
            return json.dumps({'error': {'code': 'PGRST301', 'message': 'JWT expired'}})
        for r in a['rows']:
            assert r['user_id'] == a['uid'], 'écriture pour un autre utilisateur'
            ROWS[(a['uid'], r['id'])] = {'id': r['id'], 'data': r['data'], 'deleted': r['deleted'], 'updated_at': next(CLOCK)}
        return json.dumps({'error': None})
    if op == 'rpc' and a['n'] == 'closer_ics_token':
        if not a['uid']:
            return json.dumps({'data': None, 'error': {'message': 'non connecté'}})
        if a['args'].get('renew') or a['uid'] not in ICS:
            ICS[a['uid']] = ('%064x' % (len(ICS) * 7919 + 1 + next(CLOCK)))[-64:]
        return json.dumps({'data': ICS[a['uid']], 'error': None})
    if op == 'rpc' and a['n'] != 'delete_my_account':
        return json.dumps({'data': None, 'error': None})
    if op == 'rpc':
        for k in [k for k in ROWS if k[0] == a['uid']]:
            del ROWS[k]
        for e, u in list(USERS.items()):
            if u['id'] == a['uid']:
                del USERS[e]
        return json.dumps({'error': None})
    return json.dumps({'error': {'message': 'op inconnue'}})

ok = True
def check(name, cond):
    global ok
    print(('OK   ' if cond else 'ÉCHEC'), name)
    ok = ok and bool(cond)

with sync_playwright() as p:
    b = getattr(p, ENGINE).launch(**LAUNCH)
    print('Moteur :', ENGINE)

    def device(cfg=True, appv_online=None):
        c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, locale='fr-FR', timezone_id='Europe/Paris')
        c.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        c.route('https://fonts.gstatic.com/**', lambda r: r.abort())
        c.route('https://cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK_JS))
        c.route(SB + '/rest/v1/closer_events', lambda r: (EVENTS.extend(json.loads(r.request.post_data or '[]')), r.fulfill(status=201, body='')))
        if appv_online:
            def page_route(r):
                if '?v=' in r.request.url:
                    resp = r.fetch()
                    body = resp.text().replace('var APPV="', 'var APPV="' + appv_online + '-', 1)
                    r.fulfill(status=200, content_type='text/html', body=body)
                else:
                    r.continue_()
            c.route('**/index.html*', page_route)
        c.expose_function('__srv', srv)
        c.add_init_script('window.__CLOSER_TEST=1;window.__CLOSER_CFG=' + json.dumps(CFG if cfg else {'url': '', 'key': ''}) + ';')
        pg = c.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL)
        pg.wait_for_timeout(700)
        return c, pg, errs

    def add_task(pg, title):
        pg.click('#fab')
        pg.wait_for_timeout(250)
        pg.fill('#sh-title', title)
        pg.press('#sh-title', 'Enter')
        pg.wait_for_timeout(250)

    def items(pg):
        return pg.evaluate("JSON.parse(localStorage.getItem('cap-items-v1')||'[]').filter(e=>e[1].kind!=='prefs').map(e=>e[1].title).sort()")

    def open_account(pg):
        pg.click('#ac-btn')
        pg.wait_for_timeout(250)

    def login(pg, email, pw):
        open_account(pg)
        pg.fill('#ac-em', email)
        pg.fill('#ac-pw', pw)
        pg.press('#ac-pw', 'Enter')
        pg.wait_for_timeout(900)

    # 1. Sans réglage Supabase : l'app marche, sans bouton Compte
    c, pg, errs = device(cfg=False)
    add_task(pg, 'Tâche locale')
    pg.reload(); pg.wait_for_timeout(500)
    check('sans compte : la tâche reste après rechargement', items(pg) == ['Tâche locale'])
    pg.click('#ac-btn'); pg.wait_for_timeout(450)
    check('sans réglage : le rouage ouvre « Réglages » avec la sauvegarde', pg.is_visible('#sheet [data-act="backup"]') and 'Réglages' in pg.inner_text('#sh-h'))
    pg.click('#sheet [data-act="close-sheet"]'); pg.wait_for_timeout(450)
    check('sans réglage : aucune erreur', not errs)
    c.close()

    # 2. Appareil A : des tâches locales, création de compte, connexion -> envoi
    a, pa, ea = device()
    add_task(pa, 'Réviser la compta')
    add_task(pa, 'Appeler le banquier')
    check('bouton Compte visible', pa.is_visible('#ac-btn'))
    check('statistique « open » envoyée une fois', [e['ev'] for e in EVENTS].count('open') == 1)
    check('statistique « first_item » envoyée', 'first_item' in [e['ev'] for e in EVENTS])
    open_account(pa)
    pa.click('[data-act="ac-tosignup"]')
    pa.fill('#ac-em', 'max@test.fr'); pa.fill('#ac-pw', 'faible')
    pa.press('#ac-pw', 'Enter'); pa.wait_for_timeout(200)
    check('mot de passe faible refusé', 'trop faible' in pa.inner_text('#sheet'))
    pa.fill('#ac-pw', 'Solide123'); pa.press('#ac-pw', 'Enter'); pa.wait_for_timeout(400)
    check('compte créé, message de confirmation', 'Compte créé' in pa.inner_text('#sheet'))
    pa.fill('#ac-pw', 'Solide123'); pa.press('#ac-pw', 'Enter'); pa.wait_for_timeout(1200)
    check('connecté', 'Connecté' in pa.inner_text('#sheet'))
    srv_titles = sorted(r['data']['title'] for (u, _), r in ROWS.items() if r['data'] and r['data'].get('kind') != 'prefs')
    check('les 2 tâches locales sont sur le compte', srv_titles == ['Appeler le banquier', 'Réviser la compta'])
    check('pastille verte sur Compte', 'ok' in pa.get_attribute('#ac-dot', 'class'))
    pa.click('#sheet [data-act="close-sheet"]')

    # 3. Appareil B (neuf) : connexion -> récupère tout ; modifie et supprime
    bb, pb, eb = device()
    login(pb, 'max@test.fr', 'Solide123')
    check('appareil B : tâches récupérées', items(pb) == ['Appeler le banquier', 'Réviser la compta'])
    pb.click('#sheet [data-act="close-sheet"]')
    add_task(pb, 'Préparer l\'oral')
    # supprimer « Appeler le banquier » depuis sa fiche
    pb.evaluate("location.hash='#taches'"); pb.wait_for_timeout(300)
    tid = pb.evaluate("JSON.parse(localStorage.getItem('cap-items-v1')).find(e=>e[1].title==='Appeler le banquier')[0]")
    pb.click('#v-taches [data-act="edit"][data-id="%s"]' % tid); pb.wait_for_timeout(300)
    pb.click('#sheet [data-act="sheet-del"]'); pb.wait_for_timeout(300)
    pb.wait_for_timeout(2200)  # envoi automatique (1,5 s)
    check('appareil B : suppression et ajout envoyés', sorted(r['data']['title'] for (u, _), r in ROWS.items() if not r['deleted'] and r['data'].get('kind') != 'prefs') == ['Préparer l\'oral', 'Réviser la compta'])

    # 4. Retour sur A : la synchro récupère les changements de B
    pa.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pa.wait_for_timeout(1200)
    check('appareil A : changements de B reçus', items(pa) == ['Préparer l\'oral', 'Réviser la compta'])
    check('aucune erreur sur A et B', not ea and not eb)

    # 4 bis. Conflit : la même note modifiée sur A et sur B avant synchro -> les deux versions sont gardées
    pa.evaluate("save('nc',{kind:'note',title:'Plan',text:'départ',folder:'',pinned:false,created:Date.now(),updated:Date.now()});syncNow()"); pa.wait_for_timeout(900)
    pb.evaluate("syncNow()"); pb.wait_for_timeout(900)
    check('conflit : la note est arrivée sur B', pb.evaluate("state.items.has('nc')"))
    pa.evaluate("save('nc',Object.assign({},state.items.get('nc'),{text:'version A',updated:Date.now()}));syncNow()"); pa.wait_for_timeout(900)
    pb.evaluate("save('nc',Object.assign({},state.items.get('nc'),{text:'version B',updated:Date.now()}));syncNow()"); pb.wait_for_timeout(1200)
    notes_b = pb.evaluate("[...state.items.values()].filter(d=>d.kind==='note').map(d=>d.title+'|'+d.text).sort()")
    check('conflit : B garde sa version et celle de A à côté', notes_b == ['Plan (autre appareil)|version A', 'Plan|version B'])
    check('conflit : message affiché', 'deux appareils' in pb.inner_text('#toast'))
    srv_notes = sorted(r['data']['text'] for r in ROWS.values() if r['data'] and r['data'].get('kind') == 'note' and not r['deleted'])
    check('conflit : les deux versions sont en ligne', srv_notes == ['version A', 'version B'])
    pb.evaluate("syncNow()"); pb.wait_for_timeout(900)
    check('conflit : pas de nouvelle copie au passage suivant', pb.evaluate("[...state.items.values()].filter(d=>d.kind==='note').length") == 2)
    for pg_ in (pa, pb):
        pg_.evaluate("[...state.items.entries()].filter(e=>e[1].kind==='note').forEach(e=>remove(e[0]));syncNow()"); pg_.wait_for_timeout(900)
    pa.evaluate("syncNow()"); pa.wait_for_timeout(700)
    check('conflit : aucune erreur', not ea and not eb)

    # 5. Déconnexion : les données restent sur l'appareil
    open_account(pb); pb.click('[data-act="ac-out"]'); pb.wait_for_timeout(500)
    check('déconnecté, données gardées', 'Déconnecté' in pb.inner_text('#sheet') and len(items(pb)) == 2)
    pb.click('#sheet [data-act="close-sheet"]')

    # 6. Statistiques désactivables
    n0 = len(EVENTS)
    open_account(pa); pa.click('[data-act="ac-stats"]'); pa.wait_for_timeout(200)
    check('statistiques désactivées', 'désactivées' in pa.inner_text('#sheet'))
    pa.evaluate("localStorage.removeItem('closer-ev-open-day')"); pa.reload(); pa.wait_for_timeout(800)
    check('plus aucun envoi une fois désactivé', len(EVENTS) == n0)

    # 6 ter. Jeton expiré (Mac sorti de veille) : la synchro rafraîchit la session et réessaie seule
    pa.keyboard.press('Escape'); pa.wait_for_timeout(400)
    FAIL['jwt'] = 1; add_task(pa, 'Après la veille')
    open_account(pa); pa.click('#sheet [data-act="ac-sync"]'); pa.wait_for_timeout(1200)
    check('jeton expiré : session rafraîchie puis envoi réussi', FAIL['jwt'] == 0 and pa.evaluate("window.__refreshed>0") and any(r['data'] and r['data'].get('title') == 'Après la veille' for r in ROWS.values()))

    # 6 bis. Compte › Sauvegarde, connecté : le texte parle de la synchro ; « Retour » revient au compte
    pa.keyboard.press('Escape'); pa.wait_for_timeout(400)
    open_account(pa); pa.click('#sheet [data-act="backup"]'); pa.wait_for_timeout(250)
    check('Compte › Sauvegarde : texte adapté au compte connecté', 'synchronisés sur ton compte' in pa.inner_text('#sheet'))
    pa.click('#sheet [data-act="ac-open"]'); pa.wait_for_timeout(250)
    check('« Retour » ramène à la fiche Compte', pa.is_visible('#sheet [data-act="ac-sync"]'))
    pa.keyboard.press('Escape'); pa.wait_for_timeout(400)

    # 6 quater. Réglages : statistiques, préférences, Quoi de neuf, Catégories avec retour
    open_account(pa)
    check('Réglages : bilan de la semaine affiché (à la place des 4 tuiles)', 'Ta semaine' in pa.inner_text('#sheet') and not pa.query_selector('#sheet .stats') and pa.query_selector('#sheet .rec-top'))
    pa.click('#sheet [data-act="set-news"]'); pa.wait_for_timeout(150)
    check('Réglages : « Quoi de neuf » se déplie', 'Brouillon façon Notes' in pa.inner_text('#sheet'))
    pa.click('#sheet [data-act="set-cats"]'); pa.wait_for_timeout(200)
    check('Réglages › Catégories, puis « Retour »', 'Catégories' in pa.inner_text('#sh-h'))
    pa.click('#sheet [data-act="ac-open"]'); pa.wait_for_timeout(200)
    check('retour aux Réglages', 'Réglages' in pa.inner_text('#sh-h'))
    pa.keyboard.press('Escape'); pa.wait_for_timeout(400)

    # 7. Suppression du compte
    open_account(pa); pa.click('[data-act="ac-del"]'); pa.wait_for_timeout(150); pa.click('[data-act="ac-del"]'); pa.wait_for_timeout(600)
    check('compte supprimé, données en ligne effacées', not ROWS and 'Compte supprimé' in pa.inner_text('#sheet'))
    a.close(); bb.close()

    # 7 ter. Les chiffres concordent : carte noire = Reste à faire + Habitudes du jour
    c, pg, errs = device(cfg=False)
    pg.evaluate("""()=>{const t=new Date(),z=n=>String(n).padStart(2,'0'),d=t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate());
      localStorage.setItem('cap-items-v1',JSON.stringify([
        ['a',{kind:'task',title:'Tâche',cat:'Perso',due:d,done:false,created:1}],
        ['b',{kind:'daily',title:'Lire',lastDone:'',streak:0,created:2}],
        ['c',{kind:'daily',title:'Anglais',lastDone:'',streak:0,created:3}],
        ['d',{kind:'weekly',title:'Musculation',target:3,dones:[],created:4}]]));}""")
    pg.reload(); pg.wait_for_timeout(600)
    hero = int(pg.inner_text('#hero .num'))
    heads = pg.eval_on_selector_all('#l-jour .sh', "els=>els.map(e=>e.innerText)")
    nums = sum(int(''.join(ch for ch in h.split('\n')[-1] if ch.isdigit()) or 0) for h in heads if h.startswith(('Aujourd','En retard','Habitudes')))
    check('carte noire = Aujourd\'hui + Habitudes du jour (%d = %d)' % (hero, nums), hero == nums == 3)
    c.close()

    # 7 quinquies. Tâches et devoirs dans un seul onglet, menu « Trier et ranger », points de l'agenda
    c, pg, errs = device(cfg=False)
    pg.evaluate("""()=>{const t=new Date(),z=n=>String(n).padStart(2,'0'),d=t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate());
      localStorage.setItem('cap-items-v1',JSON.stringify([
        ['a',{kind:'task',title:'Appeler',cat:'Perso',due:d,done:false,created:1}],
        ['b',{kind:'task',title:'Dossier finance',cat:'Devoir',subject:'Finance',due:d,done:false,created:2}],
        ['n',{kind:'note',title:'Budget',text:'Revoir le budget.\\nLe BUDGÉT final.',folder:'',pinned:false,created:1,updated:2}]]));}""")
    pg.reload(); pg.wait_for_timeout(500); pg.evaluate("location.hash='#devoirs'"); pg.wait_for_timeout(400)
    check('4 onglets, Devoirs devenu un filtre', pg.eval_on_selector_all('nav.tabs a', 'e=>e.length') == 4 and pg.evaluate('location.hash') == '#taches' and pg.get_attribute('#chips [data-id="Devoirs"]', 'aria-pressed') == 'true')
    check('filtre Devoirs : seulement le devoir', pg.eval_on_selector_all('#l-tasks .row .title', 'e=>e.map(x=>x.textContent)') == ['Dossier finance'])
    pg.click('#tsort'); pg.wait_for_timeout(200)
    check('menu « Trier et ranger » ouvert', pg.is_visible('#tmenu') and 'Par matière' in pg.inner_text('#tmenu'))
    pg.click('#top .brand'); pg.wait_for_timeout(200)
    check('le menu se ferme en touchant ailleurs', pg.is_hidden('#tmenu'))
    pg.click('#chips [data-id="Tout"]'); pg.wait_for_timeout(200)
    pg.click('#tsort'); pg.click('#tmenu [data-v="group"]'); pg.wait_for_timeout(300)
    check('Tout, par catégorie : groupe « Devoirs »', 'Devoirs' in pg.eval_on_selector_all('#l-tasks .sh h2', 'e=>e.map(x=>x.textContent)'))
    pg.evaluate("document.getElementById('fab').click()"); pg.wait_for_timeout(300)
    check('+ sur Tout : nouvelle tâche', 'Nouvelle tâche' in pg.inner_text('#sh-h'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("location.hash='#jour'"); pg.wait_for_timeout(300)
    check('carte du jour : « 2 tâches »', '2 tâches' in pg.inner_text('#hero'))
    check('agenda : des points au lieu des chiffres', pg.eval_on_selector_all('#week .day[aria-pressed="true"] .ct i', 'e=>e.length') == 2)
    # recherche surlignée dans le Brouillon
    pg.evaluate("location.hash='#brouillon'"); pg.wait_for_timeout(300)
    pg.fill('#nb-q', 'budget'); pg.wait_for_timeout(200)
    check('recherche : mot surligné dans la liste', pg.eval_on_selector_all('#l-notes mark', 'e=>e.length') >= 2)
    pg.click('#l-notes .nrow'); pg.wait_for_timeout(400)
    check('recherche : passages surlignés dans la note', pg.inner_text('#nf-count') == '1 sur 3')
    pg.click('[data-act="nf-next"]'); pg.wait_for_timeout(200)
    check('recherche : flèche suivante', pg.inner_text('#nf-count') == '2 sur 3')
    pg.click('[data-act="nf-edit"].nfdone'); pg.wait_for_timeout(300)
    check('recherche : « Écrire » repasse en écriture, mot sélectionné', pg.evaluate("[document.activeElement.id,String(getSelection())]") == ['ne-body', 'budget'])
    pg.evaluate("location.hash='#taches'"); pg.wait_for_timeout(300)
    check('Tâches : résumé « 2 à faire »', pg.inner_text('#tsum').startswith('2 à faire'))
    n0 = len(pg.query_selector_all('#l-tasks .row'))
    pg.click('#l-tasks [data-act="fold"]'); pg.wait_for_timeout(200)
    check('Tâches : une section se replie', pg.get_attribute('#l-tasks [data-act="fold"]', 'aria-expanded') == 'false' and len(pg.query_selector_all('#l-tasks .row')) < n0)
    pg.click('#l-tasks [data-act="fold"]'); pg.wait_for_timeout(200)
    # heure de rappel : visible seulement avec une date, gardée et affichée à droite de la ligne
    pg.evaluate("document.getElementById('fab').click()"); pg.wait_for_timeout(400)
    pg.fill('#sh-title', 'Appeler le garage')
    pg.click('#sheet [data-act="sdate"][data-v=""]'); pg.wait_for_timeout(150)
    check('rappel : pas d\'heure sans date', not pg.query_selector('#sh-time'))
    pg.click('#sheet [data-act="sdate"]:nth-child(2)'); pg.wait_for_timeout(150)
    pg.fill('#sh-time', '14:30')
    pg.click('#sheet button[type="submit"]'); pg.wait_for_timeout(500)
    saved = pg.evaluate("[...state.items.values()].find(d=>d.title==='Appeler le garage')")
    check('rappel : heure enregistrée avec la tâche', saved and saved.get('time') == '14:30')
    pg.click('#l-tasks [data-act="edit"]:has-text("Appeler le garage")'); pg.wait_for_timeout(400)
    check('rappel sans notifications activées : la fiche prévient', pg.is_visible('#sheet .pushwarn'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    check('rappel : heure affichée sur la ligne', '14:30' in pg.inner_text('#l-tasks'))
    check('onglets, menu, recherche : aucune erreur', not errs)
    c.close()

    # 7 septies. Retards : encart, « Tout reporter », glisser (fait / demain), « Annuler »
    c, pg, errs = device(cfg=False)
    pg.evaluate("""()=>{const t=new Date(),z=n=>String(n).padStart(2,'0'),f=d=>d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate());
      const y=new Date(t);y.setDate(t.getDate()-2);const d=f(t),p=f(y);
      localStorage.setItem('cap-items-v1',JSON.stringify([
        ['l1',{kind:'task',title:'Payer le loyer',cat:'Perso',due:p,done:false,created:1}],
        ['l2',{kind:'task',title:'Répondre à Amazon',cat:'Perso',due:p,done:false,created:2}],
        ['a',{kind:'task',title:'Appeler le garage',cat:'Perso',due:d,done:false,created:3}],
        ['b',{kind:'task',title:'Courses',cat:'Courses',due:d,done:false,created:4}]]));}""")
    pg.reload(); pg.wait_for_timeout(600)
    heads = pg.eval_on_selector_all('#l-jour .sh h2', 'e=>e.map(x=>x.textContent)')
    check('Jour : « En retard » à part, puis « Aujourd\'hui »', heads[:2] == ['En retard', "Aujourd'hui"])
    pg.click('#l-jour [data-act="late-today"]'); pg.wait_for_timeout(300)
    check('« Tout reporter à aujourd\'hui » : plus de retard', 'En retard' not in pg.inner_text('#l-jour') and pg.evaluate("[...state.items.values()].filter(d=>d.due===new Date().toISOString().slice(0,10)||true).every(d=>d.done||d.due>=document.querySelector('#week .day').dataset.id)"))
    pg.click('#toast-undo'); pg.wait_for_timeout(300)
    check('« Annuler » remet les deux retards', len(pg.query_selector_all('#l-jour .sh h2.late')) == 1 and pg.inner_text('#l-jour .sh:has(h2.late) .n') == '2')
    pg.click('#l-jour [data-act="task"][data-id="a"]'); pg.wait_for_timeout(300)
    check('cocher : message avec « Annuler »', 'Fait' in pg.inner_text('#toast-txt') and pg.is_visible('#toast-undo'))
    pg.click('#toast-undo'); pg.wait_for_timeout(300)
    check('« Annuler » décoche la tâche', pg.evaluate("!state.items.get('a').done"))
    cdp = Touch(c, pg)
    def swipe_row(rid, dx):
        r = pg.evaluate("(id=>{const e0=document.querySelector('#l-jour [data-act=\"task\"][data-id=\"'+id+'\"]').closest('.row');e0.scrollIntoView({block:'center'});const e=e0.getBoundingClientRect();return [e.left+e.width/2,e.top+e.height/2]})('%s')" % rid)
        cdp.send('touchStart', [{'x': r[0], 'y': r[1]}])
        for i in range(1, 7):
            pg.wait_for_timeout(16)
            cdp.send('touchMove', [{'x': r[0] + dx * i / 6, 'y': r[1] + 2}])
        cdp.send('touchEnd', [])
        pg.wait_for_timeout(450)
    swipe_row('b', 40)
    check('petit glissement : rien ne change', pg.evaluate("!state.items.get('b').done"))
    swipe_row('b', 170)
    check('glisser vers la droite : tâche faite', pg.evaluate("state.items.get('b').done===true"))
    swipe_row('a', -170)
    tom = pg.evaluate("(()=>{const t=new Date();t.setDate(t.getDate()+1);const z=n=>String(n).padStart(2,'0');return t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate())})()")
    check('glisser vers la gauche : reportée à demain (%s)' % pg.evaluate("state.items.get('a').due+' '+state.items.get('a').done"), pg.evaluate("state.items.get('a').due") == tom)
    # Brouillon : glisser une note vers la gauche = supprimer, avec « Annuler » ; vers la droite = rien
    pg.evaluate("""()=>{state.items.set('n1',{kind:'note',title:'Copie à jeter',text:'x',folder:'',pinned:false,created:1,updated:Date.now()});
      state.items.set('n2',{kind:'note',title:'À garder',text:'y',folder:'',pinned:false,created:1,updated:Date.now()-1000});persistLocal();location.hash='#brouillon';}""")
    pg.wait_for_timeout(400)
    def swipe_note(nid, dx):
        r = pg.evaluate("(id=>{const e=document.querySelector('#l-notes .nrow[data-id=\"'+id+'\"]').getBoundingClientRect();return [e.left+e.width/2,e.top+e.height/2]})('%s')" % nid)
        cdp.send('touchStart', [{'x': r[0], 'y': r[1]}])
        for i in range(1, 7):
            pg.wait_for_timeout(16)
            cdp.send('touchMove', [{'x': r[0] + dx * i / 6, 'y': r[1] + 2}])
        cdp.send('touchEnd', [])
        pg.wait_for_timeout(450)
    swipe_note('n2', 170)
    check('note glissée vers la droite : rien ne change', pg.evaluate("state.items.has('n2')") and not pg.evaluate("state.noteOpen"))
    swipe_note('n1', -170)
    check('note glissée vers la gauche : supprimée', not pg.evaluate("state.items.has('n1')") and pg.evaluate("state.items.has('n2')") and not pg.evaluate("state.noteOpen"))
    pg.click('#toast [data-act="undo"]'); pg.wait_for_timeout(300)
    check('« Annuler » remet la note', pg.evaluate("state.items.has('n1')"))
    check('corbeille de la ligne cachée sur écran tactile', not pg.is_visible('#l-notes .ndel'))
    pg.evaluate("document.querySelector('#l-notes .ndel[data-id=\"n1\"]').click()"); pg.wait_for_timeout(300)
    check('corbeille de la ligne (ordinateur) : supprime la note', not pg.evaluate("state.items.has('n1')"))
    # fiche : options rares repliées ; titre de l'onglet dans l'en-tête ; le + ne recouvre pas la liste
    pg.evaluate("location.hash='#taches'"); pg.wait_for_timeout(300)
    check('en-tête : « Tâches » à la place de « Closer »', pg.inner_text('#top .brand') == 'Tâches')
    pg.evaluate("document.getElementById('fab').click()"); pg.wait_for_timeout(400)
    check('fiche : « Important » replié sous « Plus d\'options »', not pg.is_visible('#sh-prio') and pg.is_visible('#sheet [data-act="sheet-more"]'))
    pg.click('#sheet [data-act="sheet-more"]'); pg.wait_for_timeout(200)
    check('« Plus d\'options » déplie « Important »', pg.is_visible('#sh-prio'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    # réglage « Toutes les options d'un coup »
    pg.evaluate("localStorage.setItem('closer-allopts','1')")
    pg.evaluate("document.getElementById('fab').click()"); pg.wait_for_timeout(400)
    check('réglage « Toutes les options » : « Important » et la note visibles sans toucher « Plus d\'options »', pg.is_visible('#sh-prio') and pg.is_visible('#sh-note') and not pg.query_selector('#sheet [data-act="sheet-more"]'))
    pg.evaluate("localStorage.removeItem('closer-allopts')")
    fab = pg.evaluate("(()=>{const f=document.getElementById('fab').getBoundingClientRect(),n=document.getElementById('nav').getBoundingClientRect();return [Math.round(f.top),Math.round(n.top),Math.round(f.left),Math.round(n.right)]})()")
    check('le + est dans la barre du bas, à côté des onglets', abs(fab[0] - fab[1]) < 6 and fab[2] >= fab[3])
    check('retards, glissements, fiche : aucune erreur', not errs)
    c.close()

    # 7 octies. Tâche qui se répète, rappel d'habitude, écrans vides, premiers pas
    c, pg, errs = device(cfg=False)
    check('premiers pas : la carte s\'affiche sur un appareil neuf', pg.is_visible('.onb') and '0 sur' in pg.inner_text('.onb'))
    pg.evaluate("location.hash='#objectifs'"); pg.wait_for_timeout(250)
    check('Objectifs vide : explication et bouton', pg.is_visible('#l-goals .emptyst') and 'Créer un objectif' in pg.inner_text('#l-goals'))
    pg.evaluate("location.hash='#jour'"); pg.wait_for_timeout(250)
    pg.click('#fab'); pg.wait_for_timeout(300)
    pg.fill('#sh-title', 'Payer le loyer')
    pg.click('#sheet [data-act="sdate"]:nth-child(2)'); pg.wait_for_timeout(150)
    pg.select_option('#sh-rep', 'week')
    pg.click('#sheet button[type="submit"]'); pg.wait_for_timeout(500)
    it = pg.evaluate("[...state.items.entries()].find(e=>e[1].title==='Payer le loyer')")
    check('nouvelle tâche : enregistrée comme tâche, pas comme objectif', it and it[1]['kind'] == 'task')
    check('répétition enregistrée', it and it[1].get('rep') == 'week')
    check('premiers pas : « Ajoute ta première tâche » cochée', '1 sur' in pg.inner_text('.onb'))
    check('ligne : icône de répétition', pg.query_selector('#l-jour .repi') is not None)
    pg.click('#l-jour [data-act="task"][data-id="%s"]' % it[0]); pg.wait_for_timeout(400)
    nxt = pg.evaluate("(()=>{const t=new Date();t.setDate(t.getDate()+7);const z=n=>String(n).padStart(2,'0');return t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate())})()")
    st = pg.evaluate("[...state.items.values()].filter(d=>d.title==='Payer le loyer').map(d=>[d.done,d.due,!!d.rep])")
    check('cocher une tâche qui se répète : une copie faite, la tâche passe à la semaine suivante', sorted(st) == sorted([[True, pg.evaluate('today()'), False], [False, nxt, True]]))
    check('message : prochaine fois', 'Prochaine fois' in pg.inner_text('#toast-txt'))
    pg.click('#toast-undo'); pg.wait_for_timeout(300)
    st = pg.evaluate("[...state.items.values()].filter(d=>d.title==='Payer le loyer').map(d=>[d.done,d.due])")
    check('« Annuler » : une seule tâche, revenue à aujourd\'hui', st == [[False, pg.evaluate('today()')]])
    pg.click('#fab'); pg.wait_for_timeout(300)
    pg.click('#sheet [data-act="stype"][data-v="daily"]'); pg.wait_for_timeout(150)
    pg.fill('#sh-title', 'Lire 20 pages'); pg.fill('#sh-time', '21:00')
    pg.click('#sheet button[type="submit"]'); pg.wait_for_timeout(500)
    h = pg.evaluate("[...state.items.values()].find(d=>d.title==='Lire 20 pages')")
    check('habitude : heure de rappel enregistrée', h and h['kind'] == 'daily' and h.get('time') == '21:00')
    pg.click('.onb [data-act="onb-off"]'); pg.wait_for_timeout(200)
    check('premiers pas : « Masquer » retire la carte', not pg.query_selector('.onb'))
    check('répétition, habitudes, premiers pas : aucune erreur', not errs)
    c.close()

    # 7 nonies. Jours passés, journée bouclée, répétitions manquées, repère d'objectif, ranger en glissant, fiche compacte
    c, pg, errs = device(cfg=False)
    pg.evaluate("""(()=>{const t=today(),y=shift(t,-1),add=(id,d)=>state.items.set(id,Object.assign({created:Date.now()},d));
      add('g1',{kind:'goal',title:'Stage',target:'',steps:[],reached:false});
      add('r1',{kind:'task',title:'Ranger',cat:'Perso',due:shift(t,-3),rep:'day',done:false});
      add('r2',{kind:'task',title:'Payer',cat:'Perso',due:shift(t,-3),rep:'week',done:false});
      add('h1',{kind:'daily',title:'Lire',lastDone:y,streak:1,dones:[y]});
      add('d1',{kind:'task',title:'Rendre le livre',cat:'Perso',due:y,done:true,doneOn:y,doneAt:1});
      add('a1',{kind:'task',title:'Alpha',cat:'Perso',due:shift(t,2),done:false,goal:'g1',created:1});
      add('a2',{kind:'task',title:'Bravo',cat:'Perso',due:shift(t,2),done:false,created:2});
      add('a3',{kind:'task',title:'Charlie',cat:'Perso',due:shift(t,2),done:false,created:3});
      localStorage.setItem(LS_KEY,JSON.stringify([...state.items]));})()""")
    pg.reload(); pg.wait_for_timeout(600)
    dd = pg.evaluate("[get('r1').due,get('r2').due,today()]")
    check('tâche répétée chaque jour manquée : revenue à aujourd\'hui', dd[0] == dd[2])
    check('tâche répétée chaque semaine manquée : reste en retard', dd[1] < dd[2])
    tb = pg.evaluate("(()=>{const w=$('week'),b=w.querySelector('[data-id=\"'+today()+'\"]');return [w.scrollLeft>0,Math.abs(b.getBoundingClientRect().left-w.getBoundingClientRect().left)<14,w.querySelectorAll('.day.past').length]})()")
    check('bande des jours : s\'ouvre sur aujourd\'hui, 7 jours passés à gauche', tb[0] and tb[1] and tb[2] == 7)
    pg.evaluate("document.querySelector('#week [data-id=\"'+shift(today(),-1)+'\"]').click()"); pg.wait_for_timeout(300)
    lj = pg.inner_text('#l-jour')
    check('jour passé : habitude et tâche faites ce jour-là', 'Lire' in lj and 'Rendre le livre' in lj and '2 faites' in lj)
    pg.evaluate("document.querySelector('#week [data-id=\"'+today()+'\"]').click()"); pg.wait_for_timeout(200)
    pg.evaluate("location.hash='#taches'"); pg.wait_for_timeout(300)
    lab = pg.get_attribute('#l-tasks [data-act="edit"][data-id="a1"]', 'aria-label') or ''
    check('repère discret : la tâche reliée à un objectif le montre', pg.query_selector('#l-tasks [data-id="a1"] .goali') is not None and 'Stage' in lab)
    pg.click('#tsort'); pg.wait_for_timeout(150); pg.click('#tmenu [data-act="arr"]'); pg.wait_for_timeout(250)
    check('ranger : une poignée par ligne, plus de flèches', pg.query_selector('#l-tasks .grip') is not None and pg.query_selector('#l-tasks .mv') is None)
    order = lambda: pg.evaluate("orderGroups.taches.flat().filter(i=>['a1','a2','a3'].includes(i))")
    pg.focus('#grip-a1'); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(200)
    check('ranger au clavier : flèche bas', order() == ['a2', 'a1', 'a3'] and pg.evaluate("document.activeElement.id") == 'grip-a1')
    b1 = pg.query_selector('#grip-a3').bounding_box(); b0 = pg.query_selector('#grip-a2').bounding_box()
    pg.mouse.move(b1['x'] + 20, b1['y'] + 20); pg.mouse.down()
    for k in range(1, 9): pg.mouse.move(b1['x'] + 20, b1['y'] + 20 - (b1['y'] - b0['y'] + 10) * k / 8); pg.wait_for_timeout(20)
    pg.mouse.up(); pg.wait_for_timeout(300)
    check('ranger en faisant glisser la poignée', order() == ['a3', 'a2', 'a1'])
    pg.click('#l-tasks [data-act="arr"]'); pg.wait_for_timeout(200)
    pg.evaluate("location.hash='#jour'"); pg.wait_for_timeout(300)
    pg.evaluate("byKind('task').concat(byKind('daily')).forEach(x=>{const d=get(x.id);if(d.kind==='daily'){d.lastDone=today();}else if(d.due<=today()){d.done=true;d.doneOn=today();}save(x.id,d);})"); pg.wait_for_timeout(300)
    check('tout est fait : « Journée bouclée » avec un mot', 'Journée bouclée' in pg.inner_text('#hero') and pg.evaluate("CHEERS.some(c=>$('hero').innerText.includes(c))"))
    pg.click('#fab'); pg.wait_for_timeout(350)
    ys = pg.evaluate("[...document.querySelectorAll('#sheet .segt button')].map(b=>Math.round(b.getBoundingClientRect().top))")
    check('fiche : le type tient sur une ligne en 4 segments', len(ys) == 4 and len(set(ys)) == 1)
    pg.click('#sheet [data-act="sdate"]:nth-child(2)'); pg.wait_for_timeout(150)
    t2 = pg.evaluate("[$('sh-time').getBoundingClientRect().top,$('sh-rep').getBoundingClientRect().top].map(Math.round)")
    check('fiche : « Rappel à » et « Répéter » côte à côte', abs(t2[0] - t2[1]) < 4)
    check('fiche : catégories sur une rangée qui défile', pg.evaluate("getComputedStyle(document.querySelector('#sheet [aria-label=\"Catégorie\"]')).flexWrap") == 'nowrap')
    pg.fill('#sh-time', '09:00'); pg.dispatch_event('#sh-time', 'change'); pg.wait_for_timeout(200)
    check('fiche compacte : l\'avertissement « notifications » reste affiché', pg.is_visible('#sheet .pushwarn'))
    check('nouveautés du 24 nov. (2) : aucune erreur', not errs)
    c.close()

    # 7 sexies. Apparence : clair par défaut, Sombre ou Auto dans les Réglages
    c, pg, errs = device(cfg=False)
    bg = lambda: pg.evaluate("getComputedStyle(document.body).backgroundColor")
    pg.emulate_media(color_scheme='dark'); pg.wait_for_timeout(200)
    check('thème clair par défaut, même si le téléphone est en sombre', bg() == 'rgb(239, 240, 242)')
    pg.click('#ac-btn'); pg.wait_for_timeout(450)
    pg.click('#sheet [data-act="set-theme"][data-v="dark"]'); pg.wait_for_timeout(200)
    check('Réglages › Apparence › Sombre', bg() == 'rgb(0, 0, 0)' and pg.get_attribute('#sheet [data-v="dark"]', 'aria-checked') == 'true')
    pg.reload(); pg.wait_for_timeout(500)
    check('le choix Sombre reste après rechargement', bg() == 'rgb(0, 0, 0)')
    pg.click('#ac-btn'); pg.wait_for_timeout(450)
    pg.click('#sheet [data-act="set-theme"][data-v="auto"]'); pg.wait_for_timeout(200)
    pg.emulate_media(color_scheme='light'); pg.wait_for_timeout(200)
    check('Auto : suit le téléphone', bg() == 'rgb(239, 240, 242)')
    pg.click('#sheet [data-act="set-theme"][data-v="light"]'); pg.wait_for_timeout(200)
    check('apparence : aucune erreur', not errs)
    c.close()

    # 7 quater. Brouillon : liste repliée, éditeur, dossiers, épingle, recherche, ligne -> tâche
    c, pg, errs = device(cfg=False)
    pg.goto(URL + '#brouillon'); pg.wait_for_timeout(400)
    pg.click('#fab'); pg.wait_for_timeout(350)
    check('Brouillon : + ouvre l\'éditeur, curseur dans le titre', pg.evaluate("document.activeElement.id") == 'ne-title' and pg.is_hidden('nav.tabs'))
    pg.keyboard.type('Mémoire'); pg.keyboard.press('Enter')
    check('Entrée dans le titre passe au texte', pg.evaluate("document.activeElement.id") == 'ne-body')
    pg.keyboard.type('Idées :\n- comparer deux banques\n- appeler le tuteur')
    pg.click('#ne-pin'); pg.wait_for_timeout(150)
    pg.click('[data-act="nf-new"]'); pg.wait_for_timeout(350)
    pg.fill('#sh-nfname', 'Cours'); pg.press('#sh-nfname', 'Enter'); pg.wait_for_timeout(450)
    check('nouveau dossier créé et note rangée dedans', pg.evaluate("[...document.querySelectorAll('#ne-folders [aria-pressed=true]')].map(e=>e.textContent).join()") == 'Cours')
    # ligne -> tâche : curseur sur « appeler le tuteur »
    check('texte enrichi : le texte brut est gardé ligne à ligne', pg.evaluate("state.items.get(state.noteOpen).text") == 'Idées :\n- comparer deux banques\n- appeler le tuteur')
    pg.evaluate("(()=>{const t=document.getElementById('ne-body');t.focus();const i=rteText(t).indexOf('appeler');rteSelect(t,i+3,i+3);})()")
    pg.click('[data-act="note-task"]'); pg.wait_for_timeout(400)
    check('ligne -> tâche : fiche préremplie sans le tiret', pg.input_value('#sh-title') == 'Appeler le tuteur')
    pg.press('#sh-title', 'Enter'); pg.wait_for_timeout(450)
    tasks = pg.evaluate("JSON.parse(localStorage.getItem('cap-items-v1')).filter(x=>x[1].kind==='task').map(x=>x[1].title)")
    check('la tâche est créée et on reste dans la note', tasks == ['Appeler le tuteur'] and pg.is_visible('#ne-body'))
    pg.click('[data-act="note-close"]'); pg.wait_for_timeout(350)
    pg.click('#fab'); pg.wait_for_timeout(300); pg.click('[data-act="note-close"]'); pg.wait_for_timeout(300)
    rows = pg.eval_on_selector_all('#l-notes .nrow .nt', "els=>els.map(e=>e.innerText)")
    check('liste repliée : 1 note (la vide est retirée), titre seul affiché', rows == ['Mémoire'])
    check('note épinglée rangée sous « Épinglées »', 'Épinglées' in pg.inner_text('#l-notes'))
    check('aperçu d\'une ligne sous le titre', 'Idées' in pg.inner_text('#l-notes .nrow .np'))
    pg.fill('#nb-q', 'banque'); pg.wait_for_timeout(200)
    check('recherche sans accents ni majuscules : trouve la note', len(pg.query_selector_all('#l-notes .nrow')) == 1)
    pg.fill('#nb-q', 'zzz'); pg.wait_for_timeout(200)
    check('recherche sans résultat : message clair', 'Aucune note' in pg.inner_text('#l-notes'))
    pg.fill('#nb-q', '')
    pg.click('#nb-folders [data-v="Toutes"]'); pg.wait_for_timeout(150)
    check('puces de dossiers dans la liste', pg.is_visible('#nb-folders [data-v="Cours"]'))
    pg.click('#l-notes .nrow'); pg.wait_for_timeout(300)
    pg.go_back(); pg.wait_for_timeout(350)
    check('bouton précédent du navigateur : retour à la liste', pg.is_visible('#nb-list') and pg.is_hidden('#nb-ed'))
    check('Brouillon : aucune erreur', not errs)
    c.close()

    # 7 quater bis. Brouillon : texte enrichi (gras, italique, souligné, barré, surligné), raccourcis, ancienne version
    c, pg, errs = device(cfg=False)
    pg.goto(URL + '#brouillon'); pg.wait_for_timeout(400)
    pg.click('#fab'); pg.wait_for_timeout(350)
    pg.keyboard.type('Cours'); pg.keyboard.press('Enter')
    pg.keyboard.type('Le bilan comptable\nActif et passif')
    def sel_word(w):
        pg.evaluate("(w=>{const t=document.getElementById('ne-body');t.focus();const i=rteText(t).indexOf(w);rteSelect(t,i,i+w.length);})", w)
    def note():
        return pg.evaluate("(()=>{const d=state.items.get(state.noteOpen);return {text:d.text,html:d.html||'',hk:d.hk}})()")
    check('en écrivant : barre réduite à « Tâche »', pg.get_attribute('#ne-tools', 'class').split() == ['ne-tools', 'compact'] and pg.is_visible('#ne-fmt [data-act="note-task"]') and not pg.is_visible('#ne-fmt [data-v="bold"]'))
    sel_word('bilan'); pg.wait_for_timeout(100)
    check('mots sélectionnés : barre complète', 'full' in pg.get_attribute('#ne-tools', 'class') and pg.is_visible('#ne-fmt [data-v="bold"]'))
    sel_word('bilan'); pg.click('#ne-fmt [data-v="bold"]'); pg.wait_for_timeout(150)
    check('bouton Gras : mot en gras, enregistré', '<b>bilan</b>' in note()['html'] and pg.get_attribute('#ne-fmt [data-v="bold"]', 'aria-pressed') == 'true')
    sel_word('comptable'); pg.keyboard.press('Control+i'); pg.wait_for_timeout(150)
    check('Ctrl+I : italique', '<i>comptable</i>' in note()['html'])
    sel_word('Actif'); pg.keyboard.press('Control+u'); pg.wait_for_timeout(150)
    check('Ctrl+U : souligné', '<u>Actif</u>' in note()['html'])
    sel_word('passif'); pg.keyboard.press('Control+Shift+x'); pg.wait_for_timeout(150)
    check('Ctrl+Maj+X : barré', '<s>passif</s>' in note()['html'])
    sel_word('Le'); pg.click('#ne-fmt [data-act="hl-open"]'); pg.wait_for_timeout(100)
    check('surligneur : 5 couleurs et « sans »', len(pg.query_selector_all('#hl-pop .hlc')) == 6 and pg.is_visible('#hl-pop'))
    pg.click('#hl-pop [data-v="g"]'); pg.wait_for_timeout(150)
    h = note()['html']
    check('surligné en vert, palette fermée', 'background-color: rgb(200, 241, 197)' in h and 'Le</span>' in h and pg.is_hidden('#hl-pop'))
    sel_word('Le'); pg.keyboard.press('Control+Shift+h'); pg.wait_for_timeout(150)
    check('Ctrl+Maj+H sur un passage surligné : surlignage enlevé', 'background' not in note()['html'])
    pg.keyboard.press('Control+Shift+h'); pg.wait_for_timeout(150)
    check('Ctrl+Maj+H : surligné en jaune', 'rgb(255, 240, 163)' in note()['html'])
    pg.evaluate("(()=>{const t=document.getElementById('ne-body');rteSelect(t,3,3);})()"); pg.wait_for_timeout(100)
    check('sélection annulée : la barre se réduit', 'compact' in pg.get_attribute('#ne-tools', 'class'))
    n = note()
    check('le texte brut reste propre (recherche, aperçu, tâches)', n['text'] == 'Le bilan comptable\nActif et passif' and n['hk'] == pg.evaluate("hsh(%s)" % json.dumps(n['text'])))
    # rouvrir : la mise en forme revient
    pg.click('[data-act="note-close"]'); pg.wait_for_timeout(350)
    pg.click('#l-notes .nrow'); pg.wait_for_timeout(350)
    check('note rouverte : gras, italique, souligné, barré, surligné affichés', pg.evaluate("(()=>{const b=document.getElementById('ne-body');return !!(b.querySelector('b')&&b.querySelector('i')&&b.querySelector('u')&&b.querySelector('s')&&b.querySelector('span[style*=background]'))})()"))
    # coller : texte seul ; contenu dangereux nettoyé
    check('nettoyage : script, image et styles inconnus retirés', pg.evaluate("rteClean('<div onclick=\"x()\">a<script>alert(1)</script><img src=x onerror=y><span style=\"color:red;background-color:#123456\">b</span><strong>c</strong></div>')") == '<div>ab<b>c</b></div>')
    # ancienne version de Closer sur un autre appareil : le texte a changé, la mise en forme périmée est ignorée
    pg.evaluate("(()=>{const id=state.noteOpen,d=get(id);d.text='Texte modifié ailleurs';state.items.set(id,d);persistLocal();document.getElementById('nb-ed').dataset.id='';document.activeElement.blur();render();})()")
    pg.wait_for_timeout(200)
    check('texte modifié par une ancienne version : on affiche le texte, sans mise en forme périmée', pg.inner_text('#ne-body').strip() == 'Texte modifié ailleurs' and not pg.query_selector('#ne-body b'))
    check('texte enrichi : aucune erreur', not errs)
    c.close()

    # 7 quinquies. Brouillon de fiche : fermée par erreur, la tâche est gardée ; effet à l'enregistrement
    c, pg, errs = device(cfg=False)
    pg.click('#fab'); pg.wait_for_timeout(300)
    pg.fill('#sh-title', 'Réviser le chapitre 5')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    check('fermée sans enregistrer : message « Brouillon gardé »', 'Brouillon gardé' in pg.inner_text('#toast'))
    pg.click('#fab'); pg.wait_for_timeout(300)
    check('+ reprend le brouillon, avec le bandeau', pg.input_value('#sh-title') == 'Réviser le chapitre 5' and pg.is_visible('#sh-restored'))
    pg.fill('#sh-title', 'Réviser le chapitre 5 et 6'); pg.wait_for_timeout(600)
    pg.reload(); pg.wait_for_timeout(600)
    pg.click('#fab'); pg.wait_for_timeout(300)
    check('appli fermée pendant la saisie : brouillon retrouvé', pg.input_value('#sh-title') == 'Réviser le chapitre 5 et 6')
    pg.click('[data-act="draft-clear"]'); pg.wait_for_timeout(200)
    check('« Effacer » vide la fiche', pg.input_value('#sh-title') == '' and not pg.query_selector('#sh-restored'))
    pg.fill('#sh-title', 'Appeler la banque'); pg.press('#sh-title', 'Enter'); pg.wait_for_timeout(300)
    check('enregistrement : coche animée « Tâche ajoutée »', 'ok' in pg.get_attribute('#toast', 'class') and 'Tâche ajoutée' in pg.inner_text('#toast'))
    check('enregistrement : la nouvelle ligne s\'illumine', pg.query_selector('#v-jour .flash') is not None)
    check('après enregistrement, plus de brouillon', pg.evaluate("localStorage.getItem('closer-draft')") is None)
    pg.click('#fab'); pg.wait_for_timeout(300)
    check('+ suivant : fiche vide', pg.input_value('#sh-title') == '')
    check('brouillon et effet : aucune erreur', not errs)
    c.close()

    # 7 bis. Geste iOS : glisser la fiche vers le bas la ferme ; un petit glissement lent la laisse ouverte
    c, pg, errs = device(cfg=False)
    cdp = Touch(c, pg)
    def swipe(y_from, y_to, steps, pause):
        cdp.send('touchStart', [{'x': 200, 'y': y_from}])
        for i in range(1, steps + 1):
            pg.wait_for_timeout(pause)
            cdp.send('touchMove', [{'x': 200, 'y': y_from + (y_to - y_from) * i / steps}])
        cdp.send('touchEnd', [])
        pg.wait_for_timeout(450)
    pg.click('#ac-btn'); pg.wait_for_timeout(450)
    pg.click('#sheet [data-act="backup"]'); pg.wait_for_timeout(300)
    check('Mes données › Sauvegarde : texte « sans compte »', 'cet appareil uniquement' in pg.inner_text('#sheet'))
    top = pg.evaluate("document.getElementById('sheet').getBoundingClientRect().top")
    swipe(top + 20, top + 60, 10, 40)
    check('petit glissement lent : la fiche reste ouverte', pg.evaluate("document.body.classList.contains('sheet-open')"))
    check('la fiche revient en place', pg.evaluate("getComputedStyle(document.getElementById('sheet')).transform") in ('none', 'matrix(1, 0, 0, 1, 0, 0)'))
    swipe(top + 20, top + 140, 4, 16)
    check('glissement rapide vers le bas : la fiche se ferme', not pg.evaluate("document.body.classList.contains('sheet-open')"))
    # un glissement de côté sur la rangée des dates ne doit pas fermer la fiche (vu sur iPhone)
    pg.click('#fab'); pg.wait_for_timeout(400)
    r = pg.evaluate("(()=>{const e=document.querySelector('#sheet [data-act=\"sdate\"]').parentElement.getBoundingClientRect();return [e.left,e.top,e.width,e.height]})()")
    x0, y0 = r[0] + r[2] - 30, r[1] + r[3] / 2
    def swipe2(dx, dy, steps=5, pause=16):
        cdp.send('touchStart', [{'x': x0, 'y': y0}])
        for i in range(1, steps + 1):
            pg.wait_for_timeout(pause)
            cdp.send('touchMove', [{'x': x0 + dx * i / steps, 'y': y0 + dy * i / steps}])
        cdp.send('touchEnd', [])
        pg.wait_for_timeout(450)
    swipe2(-160, 25)
    check('glissement de côté sur les dates : la fiche reste ouverte', pg.evaluate("document.body.classList.contains('sheet-open')"))
    top2 = pg.evaluate("document.getElementById('sheet').getBoundingClientRect().top")
    x0, y0 = 200, top2 + 12
    swipe2(30, 140, 4, 16)
    check('glissement vers le bas sur le haut de la fiche : elle se ferme', not pg.evaluate("document.body.classList.contains('sheet-open')"))
    check('pas de débordement horizontal sur iPhone', pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth"))
    check('aucune erreur pendant les gestes', not errs)
    c.close()

    # 7 decies. Jour : « Sans date, à caser » repliée par défaut ; replier / déplier sur le Jour
    c, pg, errs = device(cfg=False)
    pg.evaluate("""(()=>{const t=today(),add=(id,d)=>state.items.set(id,Object.assign({created:Date.now(),cat:'Perso',done:false,kind:'task'},d));
      add('u1',{title:'Trier les photos',due:''});add('u2',{title:'Lire un livre',due:''});
      add('l1',{title:'Appeler la banque',due:shift(t,-2)});add('t1',{title:'Courses',due:t});
      localStorage.setItem(LS_KEY,JSON.stringify([...state.items]));})()""")
    pg.reload(); pg.wait_for_timeout(600)
    J = '#l-jour [data-act="fold"][data-id="%s"]'
    check('Jour : « Sans date, à caser » repliée par défaut, avec son nombre',
          pg.get_attribute(J % 'jour:undated', 'aria-expanded') == 'false' and pg.inner_text((J % 'jour:undated') + ' .n') == '2' and 'Trier les photos' not in pg.inner_text('#l-jour'))
    check('Jour : « Aujourd\'hui » et « En retard » restent ouverts', 'Courses' in pg.inner_text('#l-jour') and 'Appeler la banque' in pg.inner_text('#l-jour'))
    pg.click(J % 'jour:undated'); pg.wait_for_timeout(250)
    check('toucher le titre déplie « Sans date »', 'Trier les photos' in pg.inner_text('#l-jour') and pg.get_attribute(J % 'jour:undated', 'aria-expanded') == 'true')
    check('le focus reste sur le titre déplié', pg.evaluate("document.activeElement&&document.activeElement.dataset.id==='jour:undated'"))
    pg.click(J % 'jour:late'); pg.wait_for_timeout(250)
    check('replier « En retard » sur le Jour', 'Appeler la banque' not in pg.inner_text('#l-jour'))
    pg.reload(); pg.wait_for_timeout(500)
    check('l\'état replié / déplié est gardé après rechargement', 'Trier les photos' in pg.inner_text('#l-jour') and 'Appeler la banque' not in pg.inner_text('#l-jour'))
    check('aucune erreur (repli du Jour)', not errs)
    c.close()

    # 7 undecies. Fusion de la synchro, cas par cas : on appelle syncOnce() directement avec un faux serveur
    # local = éléments de cet appareil ; known = version vue à la dernière synchro (None = supprimé) ; remote = lignes reçues
    c, pg, errs = device(cfg=False)
    MERGE_JS = """async (a)=>{
      state.items=new Map(Object.entries(a.local));SU={id:'u1'};
      SY={uid:'u1',last:a.last||0,h:{},cf:{},v:a.oldv?undefined:SY_V};
      Object.entries(a.known||{}).forEach(([k,v])=>{SY.h[k]=v===null?'x':(a.oldv?hOld(v):hOf(v));});
      if(a.cf)Object.entries(a.cf).forEach(([k,v])=>{SY.cf[k]=hOf(v);});
      const up=[];let asked=0;
      SB={from(){const b={select(){return b;},gt(){return b;},order(){return b;},
        range(x,z){asked++;return Promise.resolve({data:a.remote.slice(x,z+1),error:null});},
        upsert(rows){if(a.failUp)return Promise.resolve({error:{message:'panne'}});up.push(...rows);return Promise.resolve({error:null});}};return b;}};
      let err=null;try{await syncOnce();}catch(e){err=String(e.message||e);}
      const out={items:Object.fromEntries(state.items),up:up.map(r=>[r.id,r.deleted,r.data&&r.data.title]),last:SY.last,asked,err,
        known:Object.keys(SY.h).length,toast:document.getElementById('toast-txt').textContent};
      SB=null;SU=null;return out;}"""
    def merge(**a):
        a.setdefault('local', {}); a.setdefault('remote', [])
        return pg.evaluate(MERGE_JS, a)
    T = lambda t, **k: dict({'kind': 'task', 'title': t, 'cat': 'Perso', 'due': '', 'done': False, 'created': 1}, **k)
    N = lambda ti, tx: {'kind': 'note', 'title': ti, 'text': tx, 'folder': '', 'pinned': False, 'created': 1, 'updated': 1}
    R = lambda i, d, t=10: {'id': i, 'data': d, 'deleted': d is None, 'updated_at': t}
    v0, vl, vr = T('Courses'), T('Courses ici'), T('Courses ailleurs')
    r = merge(remote=[R('a', vr)])
    check('fusion : un élément créé ailleurs arrive ici, rien à renvoyer', r['items'].get('a', {}).get('title') == 'Courses ailleurs' and r['up'] == [])
    r = merge(local={'a': v0}, known={'a': v0}, remote=[R('a', vr)])
    check('fusion : modifié ailleurs seulement → la version d\'ailleurs remplace', r['items']['a']['title'] == 'Courses ailleurs' and r['up'] == [])
    r = merge(local={'a': v0}, known={'a': v0}, remote=[R('a', None)])
    check('fusion : supprimé ailleurs seulement → supprimé ici', 'a' not in r['items'] and r['up'] == [])
    # bug du 25 nov. : Supabase renvoie les champs dans un autre ordre ; pendant la frappe, ce n'est pas un conflit
    nk = N('Liste', 'Pain'); nk_back = dict(reversed(list(nk.items())))
    r = merge(local={'n': N('Liste', 'Pain et lait')}, known={'n': nk}, remote=[R('n', nk_back)])
    check('fusion : notre propre envoi revenu avec les champs dans un autre ordre → pas de copie « (autre appareil) »',
          len(r['items']) == 1 and r['items']['n']['text'] == 'Pain et lait' and r['up'] == [['n', False, 'Liste']])
    # passage à la nouvelle empreinte : rien n'est dupliqué, ce qui avait changé ici part quand même
    r = merge(oldv=True, local={'n': N('Liste', 'Pain et lait'), 't': v0}, known={'n': nk, 't': v0}, remote=[R('n', nk_back), R('t', dict(reversed(list(v0.items()))))])
    check('mise à jour de Closer : aucune copie créée, la note modifiée ici est renvoyée, la tâche à jour ne l\'est pas',
          len(r['items']) == 2 and r['up'] == [['n', False, 'Liste']])
    r = merge(local={'a': vl}, known={'a': v0}, remote=[R('a', v0)])
    check('fusion : modifié ici seulement → gardé et envoyé', r['items']['a']['title'] == 'Courses ici' and r['up'] == [['a', False, 'Courses ici']])
    r = merge(local={'a': vl}, known={'a': v0}, remote=[R('a', vr)])
    check('fusion : tâche modifiée des deux côtés → la version de cet appareil gagne et part au serveur',
          r['items']['a']['title'] == 'Courses ici' and r['up'] == [['a', False, 'Courses ici']] and len(r['items']) == 1)
    n0, nl, nr = N('Idées', 'a'), N('Idées', 'a ici'), N('Idées', 'a ailleurs')
    r = merge(local={'n': nl}, known={'n': n0}, remote=[R('n', nr)])
    cp = [d for k, d in r['items'].items() if k != 'n']
    check('fusion : note modifiée des deux côtés → les deux versions gardées',
          r['items']['n']['text'] == 'a ici' and len(cp) == 1 and cp[0]['title'] == 'Idées (autre appareil)' and cp[0]['text'] == 'a ailleurs' and 'deux appareils' in r['toast'])
    r = merge(local={'n': nl}, known={'n': n0}, cf={'n': nr}, remote=[R('n', nr)])
    check('fusion : la même version d\'ailleurs ne recrée pas une deuxième copie', len(r['items']) == 1)
    r = merge(local={}, known={'a': v0}, remote=[R('a', vr)])
    check('fusion : supprimé ici, modifié ailleurs → la modification revient', r['items'].get('a', {}).get('title') == 'Courses ailleurs' and r['up'] == [])
    r = merge(local={'a': vl}, known={'a': v0}, remote=[R('a', None)])
    check('fusion : modifié ici, supprimé ailleurs → la modification gagne et repart', r['items']['a']['title'] == 'Courses ici' and r['up'] == [['a', False, 'Courses ici']])
    r = merge(local={}, known={'a': v0}, remote=[])
    check('fusion : supprimé ici → la suppression part au serveur', r['up'] == [['a', True, None]])
    r = merge(local={'a': vl}, remote=[R('a', vr)])
    check('fusion : première synchro, même élément des deux côtés → rien n\'est écrasé ici', r['items']['a']['title'] == 'Courses ici' and r['up'] == [['a', False, 'Courses ici']])
    r = merge(local={'a': v0}, remote=[R('a', v0)])
    check('fusion : déjà identique des deux côtés → rien à renvoyer', r['up'] == [] and r['known'] == 1)
    many = [R('m%04d' % i, T('t%d' % i), 100 + i) for i in range(1203)]
    r = merge(remote=many)
    check('fusion : plus de 500 lignes reçues par paquets (%d demandes)' % r['asked'], len(r['items']) == 1203 and r['asked'] == 3 and r['last'] == 100 + 1202)
    r = merge(local={'a': vl}, known={'a': v0}, remote=[], failUp=True)
    check('fusion : envoi en échec → erreur remontée, l\'élément reste à renvoyer', r['err'] == 'panne' and r['items']['a']['title'] == 'Courses ici' and pg.evaluate("SY.h.a!==hOf(state.items.get('a'))"))
    check('aucune erreur (fusion)', not errs)
    c.close()

    # 7 duodecies. Lot 4 : heures rapides, barre continue, notifications qui ouvrent la tâche, récap du soir
    SEED = """(a)=>{state.items=new Map();const t=today();
      a.forEach(([id,d])=>state.items.set(id,Object.assign({created:Date.now(),cat:'Perso',done:false,kind:'task'},d,
        {due:d.due==='T'?t:d.due==='T+1'?shift(t,1):d.due},d.done?{doneOn:t}:{})));
      localStorage.setItem(LS_KEY,JSON.stringify([...state.items]));}"""
    c, pg, errs = device(cfg=False)
    # n° 5 : heures rapides
    pg.click('#fab'); pg.wait_for_timeout(300)
    check('fiche tâche : 3 heures rapides sous « Rappel à »', pg.eval_on_selector_all('#sheet .tquick .chip', 'n=>n.map(e=>e.textContent)') == ['9 h', '12 h', '18 h'])
    pg.click('#sheet .tquick [data-v="12:00"]'); pg.wait_for_timeout(150)
    check('toucher « 12 h » remplit l\'heure', pg.input_value('#sh-time') == '12:00' and pg.get_attribute('#sheet .tquick [data-v="12:00"]', 'aria-pressed') == 'true')
    check('le focus reste sur l\'heure touchée', pg.evaluate("document.activeElement.dataset.v")=='12:00')
    pg.click('#sheet .tquick [data-v="12:00"]'); pg.wait_for_timeout(150)
    check('retoucher la même heure enlève le rappel', pg.input_value('#sh-time') == '')
    pg.fill('#sh-time', '18:00'); pg.dispatch_event('#sh-time', 'change'); pg.wait_for_timeout(150)
    pg.click('#sheet [data-act="stype"][data-v="daily"]'); pg.wait_for_timeout(200)
    check('heure tapée à la main : la bonne heure rapide s\'allume (habitude aussi)', pg.get_attribute('#sheet .tquick [data-v="18:00"]', 'aria-pressed') == 'true')
    pg.click('#sheet .tquick [data-v="09:00"]'); pg.fill('#sh-title', 'Lire'); pg.press('#sh-title', 'Enter'); pg.wait_for_timeout(300)
    check('l\'heure rapide est enregistrée', pg.evaluate("[...state.items.values()].some(d=>d.title==='lire'||d.title==='Lire'?d.time==='09:00':false)"))
    # n° 11 : barre de la carte noire
    pg.evaluate(SEED, [[f't{i}', {'title': f'Tâche {i}', 'due': 'T', 'done': i < 3}] for i in range(12)])
    pg.reload(); pg.wait_for_timeout(500)
    check('plus de 10 éléments : barre continue au bon niveau', not pg.query_selector('#hero .segs') and pg.get_attribute('#hero .pbar i', 'style') == 'width:25.0%'
          and pg.get_attribute('#hero .pbar', 'aria-label') == '3 sur 12 faites')
    pg.click('#v-jour [data-act="done"][data-id="t5"], #v-jour .check[data-id="t5"]'); pg.wait_for_timeout(400)
    check('cocher fait avancer la barre continue', pg.get_attribute('#hero .pbar i', 'style') == 'width:33.3%')
    pg.evaluate(SEED, [[f't{i}', {'title': f'Tâche {i}', 'due': 'T', 'done': i < 1}] for i in range(4)])
    pg.reload(); pg.wait_for_timeout(500)
    check('10 éléments ou moins : un segment chacun', pg.eval_on_selector_all('#hero .segs i', 'n=>[n.length,n.filter(e=>e.classList.contains("on")).length]') == [4, 1] and not pg.query_selector('#hero .pbar'))
    # n° 52 : la notification ouvre la tâche ; n° 3 : le récap du soir ouvre demain
    pg.evaluate(SEED, [['a1', {'title': 'Appeler la banque', 'due': 'T', 'time': '09:00'}], ['u1', {'title': 'Trier les photos', 'due': ''}],
                       ['h1', {'kind': 'daily', 'title': 'Muscu', 'time': '18:00'}], ['d1', {'title': 'Dentiste', 'due': 'T+1'}]])
    pg.goto(URL + '#taches'); pg.goto(URL + '#ouvrir/a1'); pg.wait_for_timeout(600)
    check('lien d\'un rappel : Closer s\'ouvre simplement sur le Jour', pg.evaluate("location.hash") == '#jour' and not pg.is_hidden('#v-jour')
          and not pg.evaluate("document.body.classList.contains('sheet-open')") and not pg.query_selector('#v-jour .flash'))
    pg.goto(URL + '#taches'); pg.wait_for_timeout(300)
    pg.evaluate("navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{open:'#ouvrir/h1'}}))"); pg.wait_for_timeout(400)
    check('appli déjà ouverte : le message du service worker ramène sur le Jour', pg.evaluate("location.hash") == '#jour' and not pg.is_hidden('#v-jour')
          and not pg.evaluate("document.body.classList.contains('sheet-open')"))
    pg.evaluate("location.hash='#ouvrir/inconnu'"); pg.wait_for_timeout(300)
    check('lien vers un élément supprimé : rien ne casse, on reste sur le Jour', pg.evaluate("location.hash") == '#jour' and not pg.evaluate("document.body.classList.contains('sheet-open')"))
    pg.evaluate("location.hash='#jour/'+shift(today(),1)"); pg.wait_for_timeout(400)
    check('lien du récap du soir : le Jour s\'ouvre sur demain', pg.evaluate("state.day===shift(today(),1)&&location.hash==='#jour'") and 'Dentiste' in pg.inner_text('#v-jour'))
    check('aucune erreur (lot 4)', not errs)
    c.close()
    # n° 3 : réglage du récap du soir (connecté, notifications activées)
    USERS['soir@test.fr'] = {'pw': 'Motdepasse1', 'id': 'u-soir', 'conf': True}
    c, pg, errs = device()
    pg.evaluate("""()=>{Object.defineProperty(window,'Notification',{value:{permission:'granted',requestPermission:async()=>'granted'},configurable:true});
      if(!window.PushManager)window.PushManager=function(){};localStorage.setItem('closer-push','https://push/test');}""")
    login(pg, 'soir@test.fr', 'Motdepasse1')
    open_account(pg) if not pg.evaluate("document.body.classList.contains('sheet-open')") else None
    pg.wait_for_timeout(300)
    check('Réglages : « Récap du soir » désactivé par défaut', pg.get_attribute('#sheet [data-act="set-evening"][data-v=""]', 'aria-checked') == 'true' and 'Ce qui est prévu demain' in pg.inner_text('#sheet'))
    pg.click('#sheet [data-act="set-evening"][data-v="21:00"]'); pg.wait_for_timeout(300)
    check('choisir 21 h : enregistré sur l\'appareil et envoyé au serveur', pg.get_attribute('#sheet [data-act="set-evening"][data-v="21:00"]', 'aria-checked') == 'true'
          and pg.evaluate("localStorage.getItem('closer-evening')") == '21:00' and pg.evaluate("(window.__upd||[]).some(v=>v.evening==='21:00')"))
    check('le focus reste sur l\'heure choisie', pg.evaluate("document.activeElement.dataset.v") == '21:00')
    check('aucune erreur (récap du soir)', not errs)
    c.close()

    # 7 terdecies. Lot 5 : habitudes « certains jours », grille par semaine, record, objectifs atteints repliés, bilan de la semaine
    c, pg, errs = device(cfg=False)
    T0 = pg.evaluate("today()"); DOW = pg.evaluate("isoDow(today())")
    pg.click('#fab'); pg.wait_for_timeout(300)
    pg.click('#sheet [data-act="stype"][data-v="daily"]'); pg.wait_for_timeout(150)
    pg.click('#sheet [data-act="sfreq"][data-v="-1"]'); pg.wait_for_timeout(150)
    check('« Certains jours » : 7 jours à choisir, lundi, mercredi, vendredi proposés',
          pg.eval_on_selector_all('#sheet .dow', 'n=>n.map(e=>e.getAttribute("aria-pressed")==="true"?e.dataset.v:"").join("")') == '135' and pg.eval_on_selector_all('#sheet .dow', 'n=>n.length') == 7)
    for v in ('1', '3', '5'):
        pg.click('#sheet .dow[data-v="%s"]' % v); pg.wait_for_timeout(80)
    check('aucun jour choisi : la fiche prévient', 'Aucun jour choisi' in pg.inner_text('#sheet'))
    pg.click('#sheet .dow[data-v="%d"]' % DOW); pg.wait_for_timeout(80)
    check('le focus reste sur le jour touché', pg.evaluate("document.activeElement.dataset.v") == str(DOW))
    pg.fill('#sh-title', 'Piscine'); pg.press('#sh-title', 'Enter'); pg.wait_for_timeout(350)
    hid = pg.evaluate("[...state.items].find(([k,d])=>d.title&&d.title.toLowerCase()==='piscine')[0]")
    check('habitude enregistrée avec ses jours', pg.evaluate("JSON.stringify(state.items.get('%s').days)" % hid) == '[%d]' % DOW)
    check('prévue aujourd\'hui : elle est sur le Jour et dans la carte noire', 'Piscine' in pg.inner_text('#v-jour') and '1 habitude' in pg.inner_text('#hero'))
    pg.click('#v-jour [data-act="edit"][data-id="%s"]' % hid); pg.wait_for_timeout(350)
    check('en modification, « Certains jours » et le bon jour sont repris', pg.get_attribute('#sheet [data-act="sfreq"][data-v="-1"]', 'aria-pressed') == 'true'
          and pg.get_attribute('#sheet .dow[data-v="%d"]' % DOW, 'aria-pressed') == 'true')
    other = DOW % 7 + 1
    pg.click('#sheet .dow[data-v="%d"]' % DOW); pg.click('#sheet .dow[data-v="%d"]' % other); pg.click('#sheet [type="submit"], #sheet [data-act="sheet-save"]'); pg.wait_for_timeout(400)
    check('pas prévue aujourd\'hui : absente du Jour et de la carte noire', 'Piscine' not in pg.inner_text('#v-jour') and pg.evaluate("state.items.get('%s').days[0]" % hid) == other)
    # série : un jour prévu sur deux ne casse pas la série
    pg.evaluate("""(t)=>{const a=isoDow(t),b=isoDow(shift(t,-3));state.items.set('hs',{kind:'daily',title:'Lecture',days:[a,b],lastDone:shift(t,-3),streak:2,dones:[shift(t,-10),shift(t,-3)],created:1});
      localStorage.setItem(LS_KEY,JSON.stringify([...state.items]));render();}""", T0)
    check('série gardée entre deux jours prévus', pg.evaluate("streakOf(state.items.get('hs'))") == 2)
    pg.click('#v-jour .check[data-id="hs"]'); pg.wait_for_timeout(300)
    check('cocher prolonge la série : « 3 fois de suite »', pg.evaluate("state.items.get('hs').streak") == 3 and '3 fois de suite' in pg.inner_text('#v-jour'))
    # grille par semaine et record (n° 22, 26)
    pg.evaluate("""(t)=>{const ws=weekStart(t);state.items=new Map();
      state.items.set('w1',{kind:'weekly',title:'Muscu',target:3,dones:[shift(ws,-14),shift(ws,-7),shift(ws,-6),shift(ws,-5),t],created:1});
      const ds=[];for(let i=12;i<17;i++)ds.push(shift(t,-i));
      state.items.set('d1',{kind:'daily',title:'Méditer',lastDone:shift(t,-12),streak:5,dones:ds,created:1});
      state.items.set('d2',{kind:'daily',title:'Courir',days:[1,3,5],dones:[],created:1});
      localStorage.setItem(LS_KEY,JSON.stringify([...state.items]));}""", T0)
    pg.goto(URL + '#objectifs'); pg.wait_for_timeout(500)
    cells = dict(pg.eval_on_selector_all('#l-habits .hab', 'n=>n.map(h=>[h.querySelector(".title").textContent,[...h.querySelectorAll(".wkc")].map(c=>c.textContent+(c.classList.contains("ok")?"+":"")).join(" ")])'))
    check('grille : une case par semaine, « fait / prévu » (%s)' % cells, cells['Muscu'] == '0/3 1/3 3/3+ 1/3' and cells['Courir'] == '0/3 0/3 0/3 0/3' and cells['Méditer'].count('/7') == 4)
    check('grille lisible par VoiceOver', 'cette semaine : 1 sur 3' in pg.evaluate("[...document.querySelectorAll('#l-habits .wkg')].map(e=>e.getAttribute('aria-label')).join('|')"))
    txt = pg.inner_text('#l-habits')
    check('record visible sur chaque habitude', 'Record : 5 jours' in txt and 'Muscu' in txt and 'Lun. mer. ven.' in txt)
    pg.evaluate("""()=>{const w=state.items.get('w1');w.dones=w.dones.concat([shift(weekStart(today()),-13),shift(weekStart(today()),-12)]);save('w1',w);}""")
    pg.wait_for_timeout(200)
    check('record d\'une habitude hebdomadaire : semaines réussies d\'affilée', 'Record : 2 semaines' in pg.inner_text('#l-habits'))
    # objectifs atteints repliés (n° 23)
    pg.evaluate("""()=>{state.items.set('g1',{kind:'goal',title:'Stage',steps:[],created:1});state.items.set('g2',{kind:'goal',title:'Permis',reached:true,steps:[],created:2});render();}""")
    pg.wait_for_timeout(200)
    fb = '#v-objectifs [data-act="fold"][data-id="obj:reached"]'
    check('objectif atteint rangé dans « Atteints », replié', 'Stage' in pg.inner_text('#l-goals') and 'Permis' not in pg.inner_text('#l-goals')
          and pg.get_attribute(fb, 'aria-expanded') == 'false' and pg.inner_text(fb + ' .n') == '1')
    pg.click(fb); pg.wait_for_timeout(250)
    check('toucher « Atteints » le déplie, le focus reste dessus', 'Permis' in pg.inner_text('#l-goals') and pg.evaluate("document.activeElement.dataset.id") == 'obj:reached')
    # bilan de la semaine (n° 33)
    pg.evaluate("""(t)=>{const ws=weekStart(t);
      state.items.set('k1',{kind:'task',title:'A',done:true,doneOn:t,due:t,cat:'Perso',created:1,goal:'g1'});
      state.items.set('k2',{kind:'task',title:'B',done:true,doneOn:ws,due:ws,cat:'Perso',created:1});
      state.items.set('k3',{kind:'task',title:'C',done:true,doneOn:shift(ws,-2),due:shift(ws,-2),cat:'Perso',created:1});
      state.items.set('k4',{kind:'task',title:'D',done:false,due:shift(t,-9),cat:'Perso',created:1});render();}""", T0)
    pg.click('#ac-btn'); pg.wait_for_timeout(400)
    rt = pg.inner_text('#sheet .rec')
    check('Réglages › « Ta semaine » : tâches faites et comparaison', '2\n' in rt and '+1 par rapport à la semaine dernière' in rt)
    check('« Ta semaine » : habitudes, objectifs, retards', 'Muscu 1/3' in rt and 'Pour tes objectifs' in rt and 'Encore en retard' in rt)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    pg.goto(URL + '#jour'); pg.wait_for_timeout(400)
    check('pas de bilan sur le Jour en semaine', (DOW == 7) == bool(pg.query_selector('#v-jour .rec.onj')))
    SUN = pg.evaluate("shift(today(),7-isoDow(today()))")
    pg.evaluate("(s)=>{window.__realToday=today;today=function(){return s;};state.day=s;render();}", SUN)
    check('le dimanche, le bilan s\'affiche en haut du Jour', pg.is_visible('#v-jour .rec.onj') and 'Ta semaine' in pg.inner_text('#v-jour .rec.onj'))
    pg.click('#v-jour [data-act="recap-off"]'); pg.wait_for_timeout(200)
    check('« Masquer » le retire jusqu\'au dimanche suivant', not pg.query_selector('#v-jour .rec.onj') and pg.evaluate("localStorage.getItem('closer-recap-off')") == SUN)
    pg.evaluate("()=>{today=window.__realToday;state.day=today();render();}")
    check('aucune erreur (lot 5)', not errs)
    c.close()

    # 7 quaterdecies. Closer resté ouvert la nuit : au retour, le Jour passe au nouvel aujourd'hui (piste n° 55)
    c, pg, errs = device(cfg=False)
    pg.evaluate("""()=>{const t=today();state.items=new Map();
      state.items.set('a',{kind:'task',title:'Hier fait',done:true,doneOn:t,due:t,cat:'Perso',created:1});
      state.items.set('b',{kind:'task',title:'Pour demain',done:false,due:shift(t,1),cat:'Perso',created:2});
      localStorage.setItem(LS_KEY,JSON.stringify([...state.items]));}""")
    pg.reload(); pg.wait_for_timeout(500)
    NT = pg.evaluate("shift(today(),1)")
    pg.evaluate("(nt)=>{window.__rt=today;today=function(){return nt;};document.dispatchEvent(new Event('visibilitychange'));}", NT)
    pg.wait_for_timeout(300)
    jt = pg.inner_text('#l-jour')
    check('le lendemain, au retour sur l\'appli : le Jour affiche aujourd\'hui, pas la veille',
          pg.evaluate("state.day") == NT and 'Pour demain' in jt and 'Hier fait' not in jt and 'Prévu, pas encore fait' not in jt)
    check('la bande des jours se recale sur le nouvel aujourd\'hui', pg.get_attribute('#week [data-id="%s"]' % NT, 'aria-pressed') == 'true')
    # on regardait un autre jour : on y reste
    pg.click('#week [data-id="%s"]' % pg.evaluate("shift(today(),2)")); pg.wait_for_timeout(200)
    N2 = pg.evaluate("shift(today(),1)")
    pg.evaluate("(n2)=>{today=function(){return n2;};document.dispatchEvent(new Event('visibilitychange'));}", N2)
    pg.wait_for_timeout(300)
    check('un autre jour choisi dans la bande reste affiché', pg.evaluate("state.day") == pg.evaluate("shift(today(),1)"))
    # minuit pendant que Closer est affiché : redessiné sans toucher à rien (vérification toutes les 30 s)
    pg.evaluate("()=>{state.day=today();render();}")
    N3 = pg.evaluate("shift(today(),1)")
    pg.evaluate("(n3)=>{today=function(){return n3;};}", N3)
    pg.wait_for_timeout(31000)
    check('minuit pendant que Closer est affiché : le Jour passe au lendemain tout seul', pg.evaluate("state.day") == N3)
    pg.evaluate("()=>{today=window.__rt;}")
    check('aucune erreur (passage de minuit)', not errs)
    c.close()

    # 7 quindecies. Lot 6 : date tapée dans le titre (n° 20), « Ajouter et continuer » (n° 21), note d'une tâche (n° 15)
    c, pg, errs = device(cfg=False)
    pg.evaluate("()=>{state.items=new Map();localStorage.setItem(LS_KEY,'[]');}")
    pg.reload(); pg.wait_for_timeout(500)
    def find(title):
        return pg.evaluate("(t)=>{const e=[...state.items.entries()].find(e=>e[1].title===t);return e?e[1]:null}", title)
    # n° 20
    check('parseur : « Faire 2h de sport » n\'est pas une date', pg.evaluate("parseWhen('Faire 2h de sport')") is None)
    check('parseur : « Lire 20 pages » n\'est pas une date', pg.evaluate("parseWhen('Lire 20 pages')") is None)
    check('parseur : « Rdv le 3 décembre 2027 »', pg.evaluate("(r=>[r.due,r.rest])(parseWhen('Rdv le 3 décembre 2027'))") == ['2027-12-03', 'Rdv'])
    check('parseur : « Courses après-demain »', pg.evaluate("(r=>r.due===shift(today(),2)&&r.rest==='Courses')(parseWhen('Courses après-demain'))"))
    pg.click('#fab'); pg.wait_for_timeout(300)
    pg.fill('#sh-title', 'Appeler Marie demain 14h'); pg.wait_for_timeout(100)
    check('fiche : « Prévu demain à 14 h » sous le titre', 'demain à 14 h' in pg.inner_text('#sh-nlp'))
    check('… et la pastille « Demain » s\'allume', pg.get_attribute('#sheet [data-act="sdate"][aria-pressed="true"]', 'data-v') == pg.evaluate("shift(today(),1)"))
    pg.press('#sh-title', 'Enter'); pg.wait_for_timeout(450)
    d = find('Appeler Marie')
    check('enregistrée : titre nettoyé, date demain, rappel 14:00', d is not None and d['due'] == pg.evaluate("shift(today(),1)") and d['time'] == '14:00')
    pg.click('#fab'); pg.wait_for_timeout(300)
    pg.fill('#sh-title', 'Réviser lundi'); pg.wait_for_timeout(100)
    pg.click('#sheet [data-act="nlp-off"]'); pg.wait_for_timeout(100)
    check('« Ignorer » retire l\'aperçu', pg.inner_text('#sh-nlp').strip() == '')
    pg.press('#sh-title', 'Enter'); pg.wait_for_timeout(450)
    check('… et le titre reste tel quel', find('Réviser lundi') is not None)
    # n° 21
    pg.click('#fab'); pg.wait_for_timeout(300)
    pg.fill('#sh-title', 'Acheter du pain')
    pg.click('#sheet [data-act="sheet-again"]'); pg.wait_for_timeout(300)
    check('« Ajouter et continuer » : enregistrée, fiche vide et ouverte', find('Acheter du pain') is not None
          and pg.evaluate("document.body.classList.contains('sheet-open')") and pg.input_value('#sh-title') == ''
          and pg.evaluate("document.activeElement&&document.activeElement.id") == 'sh-title')
    check('… compteur et bouton « Terminé »', '1 ajouté' in pg.inner_text('#sheet') and pg.inner_text('#sheet [data-act="close-sheet"]').strip() == 'Terminé')
    pg.fill('#sh-title', 'Acheter du lait'); pg.press('#sh-title', 'Enter'); pg.wait_for_timeout(300)
    check('pendant une série, Entrée enchaîne aussi', find('Acheter du lait') is not None and pg.evaluate("document.body.classList.contains('sheet-open')") and '2 ajoutés' in pg.inner_text('#sheet'))
    check('la date choisie est gardée d\'une tâche à l\'autre', find('Acheter du lait')['due'] == find('Acheter du pain')['due'])
    pg.click('#sheet [data-act="close-sheet"]'); pg.wait_for_timeout(450)
    check('« Terminé » ferme la fiche sans rien ajouter de plus', not pg.evaluate("document.body.classList.contains('sheet-open')")
          and pg.evaluate("[...state.items.values()].filter(d=>d.kind==='task').length") == 4)
    # n° 15
    pg.click('#fab'); pg.wait_for_timeout(300)
    pg.fill('#sh-title', 'Rendez-vous banque')
    pg.click('#sheet [data-act="sheet-more"]'); pg.wait_for_timeout(150)
    pg.fill('#sh-note', 'Apporter le RIB. https://www.example.com/agence')
    pg.press('#sh-title', 'Enter'); pg.wait_for_timeout(450)
    check('note enregistrée avec la tâche', (find('Rendez-vous banque') or {}).get('note') == 'Apporter le RIB. https://www.example.com/agence')
    check('repère « note » sur la ligne', pg.evaluate("!!document.querySelector('[data-act=\"edit\"] .notei')"))
    pg.click('[data-act="edit"]:has-text("Rendez-vous banque")'); pg.wait_for_timeout(400)
    check('en modification : la note est affichée d\'office, avec son lien', pg.input_value('#sh-note').startswith('Apporter')
          and pg.get_attribute('#sheet .nlinks a', 'href') == 'https://www.example.com/agence' and 'Ouvrir example.com' in pg.inner_text('#sheet .nlinks'))
    pg.fill('#sh-note', ''); pg.click('#sheet button[type="submit"]'); pg.wait_for_timeout(450)
    check('note vidée : retirée de la tâche', 'note' not in find('Rendez-vous banque'))
    check('aucune erreur (lot 6)', not errs)
    c.close()

    # Calendrier : s'abonner à ses tâches (Réglages › Calendrier)
    USERS['cal@test.fr'] = {'pw': 'Motdepasse1', 'id': 'u-cal', 'conf': True}
    c, pg, errs = device(cfg=False)
    pg.click('#ac-btn'); pg.wait_for_timeout(350)
    check('Calendrier : rien sans compte', not pg.is_visible('#sheet [data-act="cal-add"]'))
    c.close()
    c, pg, errs = device()
    open_account(pg)
    check('Calendrier : rien tant qu\'on n\'est pas connecté', not pg.is_visible('#sheet [data-act="cal-add"]'))
    pg.click('#sheet [data-act="close-sheet"]'); pg.wait_for_timeout(400)
    login(pg, 'cal@test.fr', 'Motdepasse1')
    open_account(pg) if not pg.evaluate("document.body.classList.contains('sheet-open')") else None
    pg.wait_for_timeout(300)
    txt = pg.inner_text('#sheet')
    check('connecté : section Calendrier avec ses 3 boutons', all(pg.is_visible('#sheet [data-act="%s"]' % a) for a in ('cal-add', 'cal-copy', 'cal-renew'))
          and 'Ajouter à Calendrier' in txt and 'garde-le pour toi' in txt)
    check('le lien n\'est pas créé avant d\'en avoir besoin', 'u-cal' not in ICS)
    pg.evaluate("calGo=function(u){window.__went=u;}")
    pg.click('#sheet [data-act="cal-add"]'); pg.wait_for_timeout(400)
    went = pg.evaluate("window.__went") or ''
    check('« Ajouter à Calendrier » ouvre le lien webcal de la fonction, avec la clé du compte',
          went == 'webcal://test.supabase.co/functions/v1/closer-ics?cle=' + ICS.get('u-cal', '?'))
    check('… et explique quoi faire', 'S\'abonner' in pg.inner_text('#toast') if pg.query_selector('#toast') else False)
    # copie : réussie, puis impossible (le lien s'affiche à sélectionner)
    pg.evaluate("Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__clip=t;}},configurable:true})")
    pg.click('#sheet [data-act="cal-copy"]'); pg.wait_for_timeout(300)
    check('« Copier le lien » copie l\'adresse https', pg.evaluate("window.__clip") == 'https://test.supabase.co/functions/v1/closer-ics?cle=' + ICS['u-cal'])
    pg.evaluate("Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('refusé');}},configurable:true})")
    pg.click('#sheet [data-act="cal-copy"]'); pg.wait_for_timeout(300)
    check('copie refusée : le lien s\'affiche, prêt à sélectionner', pg.is_visible('#cal-link') and pg.input_value('#cal-link').endswith(ICS['u-cal']))
    old = ICS['u-cal']
    pg.click('#sheet [data-act="cal-renew"]'); pg.wait_for_timeout(250)
    check('« Changer le lien » demande une confirmation', ICS['u-cal'] == old and 'Confirmer : changer le lien' in pg.inner_text('#sheet'))
    pg.click('#sheet [data-act="cal-renew"]'); pg.wait_for_timeout(400)
    check('… puis crée une nouvelle clé, affichée et utilisée ensuite', ICS['u-cal'] != old and pg.input_value('#cal-link').endswith(ICS['u-cal'])
          and 'Confirmer' not in pg.inner_text('#sheet'))
    pg.click('#sheet [data-act="cal-add"]'); pg.wait_for_timeout(300)
    check('le nouvel abonnement utilise la nouvelle clé', pg.evaluate("window.__went").endswith(ICS['u-cal']))
    check('aucune erreur (calendrier)', not errs)
    c.close()

    # 8. Bandeau de mise à jour quand une nouvelle version est en ligne
    c, pg, errs = device(appv_online='9999')
    pg.wait_for_timeout(3200)
    check('bandeau « Nouvelle version » affiché', pg.is_visible('#upd'))
    c.close()
    b.close()

print('\nTOUT EST OK' if ok else '\nDES TESTS ONT ÉCHOUÉ')
sys.exit(0 if ok else 1)
