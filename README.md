# Closer

Une application web personnelle pour organiser ses journées : agenda sur 7 jours, tâches, devoirs, habitudes et objectifs long terme, dans une seule page.

Elle fonctionne **sans compte** (données dans le navigateur de l'appareil) ou **avec un compte facultatif** pour retrouver ses éléments sur tous ses appareils.

**Application :** https://maxencegayet.github.io/closer/

## Pourquoi ce projet

Les applications existantes (to-do, agenda, suivi d'habitudes) séparaient ce que je voulais voir au même endroit : mes cours, mon job étudiant, mes habitudes et mes objectifs. J'ai donc défini mon propre outil, centré sur une question : que me reste-t-il à faire aujourd'hui ?

## Fonctionnalités

- **Jour** : ce qui reste aujourd'hui (tâches et habitudes), une barre d'avancement et une bande des 7 prochains jours.
- **Tâches** : un seul onglet pour les tâches et les devoirs (filtre « Devoirs »), sections par période (aujourd'hui, demain, cette semaine, plus tard) repliables, date et catégorie alignées à droite comme sur un relevé, tri par catégorie ou matière, rangement manuel.
- **Habitudes** : chaque jour, certains jours de la semaine (ex. lundi, mercredi, vendredi) ou un nombre de fois par semaine (ex. 3 séances), avec série en cours, record et bilan des 4 dernières semaines.
- **Objectifs** : repliables, avec échéance, compte à rebours et une seule liste pour les étapes et les tâches reliées ; les objectifs atteints sont rangés à part.
- **Bilan de la semaine** : tâches faites (comparées à la semaine précédente), habitudes tenues, retards ; dans les Réglages, et sur le Jour le dimanche.
- **Brouillon** : notes façon Notes d'iPhone (dossiers, épingles), texte enrichi (gras, italique, surligneurs), photos et fichiers joints, recherche avec le mot surligné dans la liste et dans la note.
- **Compte facultatif** : connexion par e-mail et mot de passe, synchronisation automatique entre téléphone et ordinateur, suppression du compte en un geste.
- **Sauvegarde** : export et import des données dans un fichier.
- **Mises à jour** : un bandeau « Nouvelle version » apparaît dès qu'une version est mise en ligne.
- **Installable** : s'ajoute à l'écran d'accueil du téléphone et s'ouvre hors connexion.
- **Notifications** : rappel à l'heure choisie pour une tâche ou une habitude, récap du matin et récap du soir (ce qui est prévu demain), envoyés par une fonction Supabase (Web Push, sans service tiers).
- **Calendrier Apple** : abonnement aux tâches datées depuis l'app Calendrier (ou tout calendrier qui accepte un lien .ics), en lecture seule, par un lien secret qu'on peut changer dans les Réglages. Fonction Supabase `closer-ics`.
- **Apparence** : clair par défaut, sombre ou automatique (comme le téléphone), au choix dans les Réglages.
- **Univers** : six ambiances de couleurs, chacune avec sa matière (grès, chêne, marbre, albâtre, terre cuite, ardoise), déclinées dans toute l'appli, en clair comme en sombre ; contrastes vérifiés automatiquement.

## Choix techniques

| Sujet | Choix |
|---|---|
| Interface | HTML, CSS et JavaScript, sans framework ni étape de compilation : la page, deux feuilles de style et 9 fichiers JavaScript par domaine |
| Stockage | `localStorage` sur l'appareil, toujours ; le compte s'y ajoute sans le remplacer |
| Comptes et synchro | Supabase (projet dédié à Closer) : authentification, base PostgreSQL, règles d'accès par utilisateur (RLS) |
| Synchronisation | Élément par élément : seuls les éléments modifiés sont envoyés ; les suppressions se propagent ; l'heure de modification est posée par le serveur pour ne pas dépendre de l'horloge des appareils. En cas de conflit sur une note, les deux versions sont gardées ; une modification l'emporte sur une suppression |
| Erreurs | Gardées sur l'appareil (20 dernières) et jointes au message « Donner mon avis » ; remontées anonymement (message nettoyé, désactivable) pour repérer un bug avant qu'il soit signalé ; alerte si la mémoire de l'appareil est pleine |
| Hors ligne | Manifeste + service worker (réseau d'abord, cache en secours) |
| Qualité | Tests automatiques à chaque envoi sur GitHub : l'appli dans Chromium et dans WebKit, le moteur de Safari (Playwright), la fusion de la synchro cas par cas, et la fonction de notifications avec un faux Supabase (Deno) ; puis contrôles de qualité : relecture du JavaScript (ESLint), accessibilité (axe-core, WCAG 2.1 AA), budgets de poids, vitesse et stabilité à l'ouverture, liens des feuilles de style |
| Accessibilité | Pensée d'abord pour le téléphone, utilisable au clavier, respecte « réduire les animations » |

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | La page, sa politique de sécurité et le numéro de version (`<meta name="closer-version">`, lu par `js/tete.js` dans `APPV`) |
| `css/closer.css` | Styles, thème clair et sombre (couleurs regroupées en variables), règles d'usage des univers |
| `css/univers.css`, `js/univers.js`, `matieres/` | Couleurs et matières des univers : **fabriqués** par `outils/univers.py`, ne pas modifier à la main |
| `outils/univers.py` | Fabrique les univers et contrôle les contrastes (`--verifier` : vérifie qu'ils sont à jour) |
| `js/base.js` | Constantes, état, outils, journal des erreurs, stockage local, lignes de liste |
| `js/vues.js` | Écrans Jour, Tâches, Objectifs, habitudes |
| `js/brouillon.js` | Brouillon : liste, recherche surlignée, éditeur |
| `js/fiche.js` | Fiche d'ajout et de modification |
| `js/actions.js` | Rendu, navigation, actions au toucher |
| `js/sync.js` | Mises à jour, compte et synchronisation Supabase |
| `js/reglages.js` | Réglages et statistiques |
| `js/demarrage.js` | Geste de fermeture des fiches et lancement (chargé en dernier) |
| `sw.js` | Mode hors ligne (dont les matières, liste tenue à jour par `outils/univers.py`), mises à jour, notifications |
| `splash/` | Écrans de lancement iPhone, un par taille d'écran, fabriqués par `splash/fabriquer.py` |
| `supabase/closer.sql` | Tables, règles d'accès, suppression de compte et statistiques (à exécuter une fois dans Supabase) |
| `supabase/erreurs.sql` | Table des erreurs remontées (anonymes, gardées 90 jours) et requête pour les lire |
| `supabase/calendrier.sql` | Clé secrète du lien d'abonnement au calendrier (à exécuter une fois, après `closer.sql`) |
| `supabase/functions/closer-ics/` | Fonction qui donne les tâches au format calendrier (.ics) |
| `tests/smoke.py` | Tests de fumée, avec un faux Supabase (aucun réseau nécessaire) ; `ENGINE=webkit` pour le moteur de Safari |
| `tests/qualite.py` | Contrôles de qualité, lancés à la fin de `smoke.py` (ESLint, axe-core, poids, vitesse, univers à jour) ; règles ESLint dans `tests/eslint.config.mjs` |
| `tests/push/` | Tests des fonctions `closer-push` (notifications) et `closer-ics` (calendrier) (faux Supabase, faux service de notifications, horloge réglable) |
| `.github/workflows/tests.yml` | Lance les tests à chaque envoi sur GitHub (onglet Actions) |

À chaque mise en ligne : changer `<meta name="closer-version">` dans `index.html` et le nom du cache `CACHE` dans `sw.js`.

## Tests

```
python3 -m http.server 8766 &
python3 tests/smoke.py
ENGINE=webkit python3 tests/smoke.py          # moteur de Safari (python -m playwright install webkit)
deno test --no-check --import-map=tests/push/import_map.json --allow-env tests/push/
```

Vérifie notamment : fonctionnement sans compte, conflit de synchronisation sur une note, onglet Tâches avec le filtre Devoirs, recherche surlignée, mode sombre, création de compte (mot de passe trop faible refusé), envoi des éléments locaux à la première connexion, récupération sur un second appareil, propagation d'un ajout et d'une suppression, déconnexion sans perte de données, statistiques désactivables, suppression du compte, bandeau de nouvelle version ; fusion de la synchro cas par cas (modifié ici, ailleurs, des deux côtés, supprimé d'un côté, plus de 500 lignes, envoi en échec) ; rappels de tâches et d'habitudes, récap du matin, fuseau horaire, appareil désabonné.

## Données et confidentialité

- **Sans compte**, rien ne quitte l'appareil.
- **Avec un compte**, l'adresse e-mail et les éléments sont stockés dans Supabase ; chaque compte ne peut lire que ses propres données.
- **Statistiques anonymes** : un identifiant tiré au hasard sur l'appareil, sans lien avec le compte ni le contenu, et seulement 4 événements (`open` une fois par jour, `first_item`, `active`, `signup`). Désactivables dans **Réglages › Préférences**.

## Démarche

J'ai conçu ce projet en dirigeant un assistant IA (Claude, d'Anthropic) : j'ai défini le besoin, les fonctionnalités et la direction visuelle, testé chaque version sur mon usage réel, puis fait corriger et évoluer l'application par itérations (critique d'ergonomie, refonte de la navigation, sauvegarde, comptes et synchronisation). Le code a été généré par l'IA sous ma direction.

## Limites connues

- Si une même tâche ou un même objectif est modifié sur deux appareils hors connexion, la version de l'appareil qui se synchronise en dernier est conservée (pour les notes, les deux versions sont gardées).
- Les fichiers JavaScript partagent des variables globales (pas de modules) : simple à lire et sans outil, au prix d'un ordre de chargement à respecter.
- Les notifications demandent un compte et, sur iPhone, Closer ajouté à l'écran d'accueil (iOS 16.4 ou plus).

## Sécurité

| Où | Protection |
|---|---|
| Page | Politique de sécurité du contenu (`index.html`) : scripts de l'appli seulement (aucun script en ligne, aucun `eval`), échanges réseau limités à Closer et à son Supabase, aucun objet ni cadre |
| Code tiers | Bibliothèque Supabase hébergée dans `vendor/` (copie figée, fabriquée par `outils/supabase-js.sh`, empreinte SHA-256 vérifiée par les tests) : rien n'est chargé depuis un site externe |
| Données | Règles d'accès Supabase (chacun ne lit et ne modifie que ses propres éléments, photos et appareils) ; tailles maximales et plafond de 20 000 éléments par compte (`supabase/securite.sql`) |
| Texte enrichi | Les notes sont reconstruites balise par balise avant affichage (liste blanche) ; liens limités à http/https |
| Import | Chaque élément d'une sauvegarde est contrôlé (identifiant, type connu, taille, profondeur, clés piégées) ; les éléments douteux sont écartés |
| Notifications | La fonction `closer-push` n'envoie les rappels que sur appel de pg_cron avec une clé secrète ; l'essai n'est possible que pour un appareil du compte connecté |
| Anonyme | Statistiques et erreurs anonymes à débit limité côté serveur |
| Contrôles | `tests/qualite.py` vérifie à chaque envoi : politique en place et respectée sur tous les écrans, envoi vers un site tiers bloqué, aucun code externe, empreinte de `vendor/` |
