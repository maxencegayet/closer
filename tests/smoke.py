"""Tests de fumée de Closer (navigateur réel, sans réseau : Supabase est simulé).
Lancer depuis la racine du dépôt :  python3 -m http.server 8766 &  puis  python3 tests/smoke.py
Nécessite : pip install playwright  (et un Chrome/Chromium)."""
import json, os, sys, itertools
from playwright.sync_api import sync_playwright

URL = os.environ.get('CLOSER_URL', 'http://localhost:8766/index.html')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
LAUNCH = {'args': ['--no-sandbox']}
if CHROME and os.path.exists(CHROME):
    LAUNCH['executable_path'] = CHROME
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
    upsert(rows){return call('upsert',{rows,uid:cur()});}};return b;}
  return {auth,from,rpc:async(n)=>call('rpc',{n,uid:cur()})};
}
"""
USERS, ROWS, EVENTS = {}, {}, []
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
    b = p.chromium.launch(**LAUNCH)

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
    check('Réglages : statistiques affichées', 'Tes statistiques' in pa.inner_text('#sheet') and 'objectifs atteints' in pa.inner_text('#sheet'))
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
    check('recherche : « Écrire » repasse en écriture, mot sélectionné', pg.evaluate("[document.activeElement.id,document.activeElement.value.slice(document.activeElement.selectionStart,document.activeElement.selectionEnd)]") == ['ne-body', 'budget'])
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
    cdp = c.new_cdp_session(pg)
    def swipe_row(rid, dx):
        r = pg.evaluate("(id=>{const e0=document.querySelector('#l-jour [data-act=\"task\"][data-id=\"'+id+'\"]').closest('.row');e0.scrollIntoView({block:'center'});const e=e0.getBoundingClientRect();return [e.left+e.width/2,e.top+e.height/2]})('%s')" % rid)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': r[0], 'y': r[1]}]})
        for i in range(1, 7):
            pg.wait_for_timeout(16)
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': r[0] + dx * i / 6, 'y': r[1] + 2}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        pg.wait_for_timeout(450)
    swipe_row('b', 40)
    check('petit glissement : rien ne change', pg.evaluate("!state.items.get('b').done"))
    swipe_row('b', 170)
    check('glisser vers la droite : tâche faite', pg.evaluate("state.items.get('b').done===true"))
    swipe_row('a', -170)
    tom = pg.evaluate("(()=>{const t=new Date();t.setDate(t.getDate()+1);const z=n=>String(n).padStart(2,'0');return t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate())})()")
    check('glisser vers la gauche : reportée à demain (%s)' % pg.evaluate("state.items.get('a').due+' '+state.items.get('a').done"), pg.evaluate("state.items.get('a').due") == tom)
    # fiche : options rares repliées ; titre de l'onglet dans l'en-tête ; le + ne recouvre pas la liste
    pg.evaluate("location.hash='#taches'"); pg.wait_for_timeout(300)
    check('en-tête : « Tâches » à la place de « Closer »', pg.inner_text('#top .brand') == 'Tâches')
    pg.evaluate("document.getElementById('fab').click()"); pg.wait_for_timeout(400)
    check('fiche : « Important » replié sous « Plus d\'options »', not pg.is_visible('#sh-prio') and pg.is_visible('#sheet [data-act="sheet-more"]'))
    pg.click('#sheet [data-act="sheet-more"]'); pg.wait_for_timeout(200)
    check('« Plus d\'options » déplie « Important »', pg.is_visible('#sh-prio'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    fab = pg.evaluate("(()=>{const f=document.getElementById('fab').getBoundingClientRect(),n=document.getElementById('nav').getBoundingClientRect();return [Math.round(f.top),Math.round(n.top),Math.round(f.left),Math.round(n.right)]})()")
    check('le + est dans la barre du bas, à côté des onglets', abs(fab[0] - fab[1]) < 6 and fab[2] >= fab[3])
    check('retards, glissements, fiche : aucune erreur', not errs)
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
    pg.evaluate("(()=>{const t=document.getElementById('ne-body');t.focus();const i=t.value.indexOf('appeler');t.setSelectionRange(i+3,i+3);})()")
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
    cdp = c.new_cdp_session(pg)
    def swipe(y_from, y_to, steps, pause):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 200, 'y': y_from}]})
        for i in range(1, steps + 1):
            pg.wait_for_timeout(pause)
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 200, 'y': y_from + (y_to - y_from) * i / steps}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
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
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y0}]})
        for i in range(1, steps + 1):
            pg.wait_for_timeout(pause)
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + dx * i / steps, 'y': y0 + dy * i / steps}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
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

    # 8. Bandeau de mise à jour quand une nouvelle version est en ligne
    c, pg, errs = device(appv_online='9999')
    pg.wait_for_timeout(3200)
    check('bandeau « Nouvelle version » affiché', pg.is_visible('#upd'))
    c.close()
    b.close()

print('\nTOUT EST OK' if ok else '\nDES TESTS ONT ÉCHOUÉ')
sys.exit(0 if ok else 1)
