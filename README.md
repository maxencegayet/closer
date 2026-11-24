# Closer

Une application web personnelle pour organiser ses journées : agenda sur 7 jours, tâches, devoirs, habitudes et objectifs long terme, dans une seule page.

Elle fonctionne **sans compte** (données dans le navigateur de l'appareil) ou **avec un compte facultatif** pour retrouver ses éléments sur tous ses appareils.

**Application :** https://maxencegayet.github.io/closer/

## Pourquoi ce projet

Les applications existantes (to-do, agenda, suivi d'habitudes) séparaient ce que je voulais voir au même endroit : mes cours, mon job étudiant, mes habitudes et mes objectifs. J'ai donc défini mon propre outil, centré sur une question : que me reste-t-il à faire aujourd'hui ?

## Fonctionnalités

- **Jour** : ce qui reste aujourd'hui (tâches et habitudes), une barre d'avancement et une bande des 7 prochains jours.
- **Tâches** : un seul onglet pour les tâches et les devoirs (filtre « Devoirs »), sections par période (aujourd'hui, demain, cette semaine, plus tard) repliables, date et catégorie alignées à droite comme sur un relevé, tri par catégorie ou matière, rangement manuel.
- **Habitudes** : quotidiennes (avec série de jours consécutifs) ou hebdomadaires (par exemple 3 séances par semaine).
- **Objectifs** : repliables, avec échéance, compte à rebours et une seule liste pour les étapes et les tâches reliées.
- **Brouillon** : notes façon Notes d'iPhone (dossiers, épingles), recherche avec le mot surligné dans la liste et dans la note.
- **Compte facultatif** : connexion par e-mail et mot de passe, synchronisation automatique entre téléphone et ordinateur, suppression du compte en un geste.
- **Sauvegarde** : export et import des données dans un fichier.
- **Mises à jour** : un bandeau « Nouvelle version » apparaît dès qu'une version est mise en ligne.
- **Installable** : s'ajoute à l'écran d'accueil du téléphone et s'ouvre hors connexion.
- **Notifications** : rappel à l'heure choisie pour une tâche et récap du matin, envoyés par une fonction Supabase (Web Push, sans service tiers).
- **Apparence** : clair par défaut, sombre ou automatique (comme le téléphone), au choix dans les Réglages.

## Choix techniques

| Sujet | Choix |
|---|---|
| Interface | HTML, CSS et JavaScript, sans framework ni étape de compilation : la page, une feuille de style et 8 fichiers JavaScript par domaine |
| Stockage | `localStorage` sur l'appareil, toujours ; le compte s'y ajoute sans le remplacer |
| Comptes et synchro | Supabase (projet dédié à Closer) : authentification, base PostgreSQL, règles d'accès par utilisateur (RLS) |
| Synchronisation | Élément par élément : seuls les éléments modifiés sont envoyés ; les suppressions se propagent ; l'heure de modification est posée par le serveur pour ne pas dépendre de l'horloge des appareils. En cas de conflit sur une note, les deux versions sont gardées ; une modification l'emporte sur une suppression |
| Erreurs | Gardées sur l'appareil (20 dernières) et jointes au message « Donner mon avis » ; alerte si la mémoire de l'appareil est pleine |
| Hors ligne | Manifeste + service worker (réseau d'abord, cache en secours) |
| Qualité | Tests automatiques dans un vrai navigateur (Playwright) à chaque envoi sur GitHub |
| Accessibilité | Pensée d'abord pour le téléphone, utilisable au clavier, respecte « réduire les animations » |

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | La page et le numéro de version (`APPV`) |
| `css/closer.css` | Styles, thème clair et sombre (couleurs regroupées en variables) |
| `js/base.js` | Constantes, état, outils, journal des erreurs, stockage local, lignes de liste |
| `js/vues.js` | Écrans Jour, Tâches, Objectifs, habitudes |
| `js/brouillon.js` | Brouillon : liste, recherche surlignée, éditeur |
| `js/fiche.js` | Fiche d'ajout et de modification |
| `js/actions.js` | Rendu, navigation, actions au toucher |
| `js/sync.js` | Mises à jour, compte et synchronisation Supabase |
| `js/reglages.js` | Réglages et statistiques |
| `js/demarrage.js` | Geste de fermeture des fiches et lancement (chargé en dernier) |
| `sw.js` | Mode hors ligne et mises à jour |
| `supabase/closer.sql` | Tables, règles d'accès, suppression de compte et statistiques (à exécuter une fois dans Supabase) |
| `tests/smoke.py` | Tests de fumée, avec un faux Supabase (aucun réseau nécessaire) |
| `.github/workflows/tests.yml` | Lance les tests à chaque envoi sur GitHub (onglet Actions) |

À chaque mise en ligne : changer `APPV` dans `index.html` et le nom du cache `CACHE` dans `sw.js`.

## Tests

```
python3 -m http.server 8766 &
python3 tests/smoke.py
```

Vérifie notamment : fonctionnement sans compte, conflit de synchronisation sur une note, onglet Tâches avec le filtre Devoirs, recherche surlignée, mode sombre, création de compte (mot de passe trop faible refusé), envoi des éléments locaux à la première connexion, récupération sur un second appareil, propagation d'un ajout et d'une suppression, déconnexion sans perte de données, statistiques désactivables, suppression du compte, bandeau de nouvelle version.

## Données et confidentialité

- **Sans compte**, rien ne quitte l'appareil.
- **Avec un compte**, l'adresse e-mail et les éléments sont stockés dans Supabase ; chaque compte ne peut lire que ses propres données.
- **Statistiques anonymes** : un identifiant tiré au hasard sur l'appareil, sans lien avec le compte ni le contenu, et seulement 4 événements (`open` une fois par jour, `first_item`, `active`, `signup`). Désactivables dans **Réglages › Préférences**.

## Démarche

J'ai conçu ce projet en dirigeant un assistant IA (Claude, d'Anthropic) : j'ai défini le besoin, les fonctionnalités et la direction visuelle, testé chaque version sur mon usage réel, puis fait corriger et évoluer l'application par itérations (critique d'ergonomie, refonte de la navigation, sauvegarde, comptes et synchronisation). Le code a été généré par l'IA sous ma direction.

## Limites connues

- Si une même tâche ou un même objectif est modifié sur deux appareils hors connexion, la version de l'appareil qui se synchronise en dernier est conservée (pour les notes, les deux versions sont gardées).
- Les fichiers JavaScript partagent des variables globales (pas de modules) : simple à lire et sans outil, au prix d'un ordre de chargement à respecter.
- Pas de notifications de rappel.
